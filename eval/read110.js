// Measures the reading step on 110 labelled synthetic answers with the app's
// own code: the same router, prompt, schema, guard and readAll() loop, in
// ONLY_ON_DEVICE mode. When readAll() stops because the local model is not
// answering, the page waits five seconds and resumes, as a person pressing
// "Continue reading" would, and records the stop.
import { createRouter } from '../src/ai/router.js';
import { getSdk } from '../src/ai/firebase.js';
import { deviceAvailability } from '../src/ai/device.js';
import { cloudModels } from '../src/config/firebase-config.js';
import { readAll, readSystem, readSchema, answerPrompt } from '../src/study/reader.js';
import { gistAllowed } from '../src/study/guard.js';
import { ITEMS, STUDY } from './answers110.js';

const env = { deviceAvailability, online: () => navigator.onLine, cloudConfigured: () => false };
const router = createRouter({ sdk: getSdk(), env, cloudModels });
const THEME_NAMES = STUDY.themes.map((t) => t.name);
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keeps = (gist, id) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(id)}(?![\\p{L}\\p{N}])`, 'iu').test(gist);
const round = (x) => Math.round(x * 1000) / 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prf = (tp, fp, fn) => {
  const p = tp + fp ? tp / (tp + fp) : 1;
  const r = tp + fn ? tp / (tp + fn) : 1;
  return { p: round(p), r: round(r), f1: round(p + r ? (2 * p * r) / (p + r) : 0) };
};

const state = { status: 'idle', run: 0, done: 0, total: ITEMS.length, runs: [], errors: [], stalls: [], summary: null };
const SAVED_KEY = 'earshot.eval.read110';
window.__read = { state, run, sample, summarize, bench, capCheck, saved: () => localStorage.getItem(SAVED_KEY), ITEMS };

const UNREAD = { failed: true, unread: true, themes: [], sentiment: 'neutral', flag: false, gist: '', ms: 0, source: null };

async function readOnce() {
  const study = { ...STUDY, confidential: true, answers: ITEMS.map((item, i) => ({ id: `a${i + 1}`, text: item.text, group: '', reading: null, shareGist: false })) };
  const count = () => study.answers.filter((a) => a.reading).length;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await readAll({ study, router, onReading: () => { state.done = count(); } });
      break;
    } catch (error) {
      if (!['device-error', 'device-timeout'].includes(error.code)) throw error;
      state.stalls.push({ run: state.run, afterAnswers: count(), code: error.code, at: new Date().toISOString() });
      await wait(5000);
    }
  }
  return study.answers.map((a) => a.reading ?? UNREAD);
}

function score(readings) {
  let tp = 0, fp = 0, fn = 0, fpStrict = 0, toneOk = 0, toneN = 0, fTp = 0, fFp = 0, fFn = 0, failed = 0, unread = 0, blocked = 0;
  const misses = [];
  const leaks = [];
  const flagErrors = [];
  ITEMS.forEach((item, i) => {
    const r = readings[i];
    if (r.unread) unread += 1;
    else if (r.failed) failed += 1;
    const predicted = new Set(r.themes);
    const missing = item.must.filter((t) => !predicted.has(t));
    const extra = [...predicted].filter((t) => !item.must.includes(t) && !item.may.includes(t));
    tp += item.must.length - missing.length;
    fn += missing.length;
    fp += extra.length;
    fpStrict += [...predicted].filter((t) => !item.must.includes(t)).length;
    if (missing.length || extra.length) misses.push(`${i + 1}:${missing.length ? ` -${missing.join(',')}` : ''}${extra.length ? ` +${extra.join(',')}` : ''}`);
    if (item.tone) {
      toneN += 1;
      if (item.tone.includes(r.sentiment)) toneOk += 1;
    }
    if (item.flag !== null && item.flag !== r.flag) flagErrors.push(`${i + 1}:${r.flag ? 'raised' : 'missed'}`);
    if (item.flag === true && r.flag) fTp += 1;
    if (item.flag === true && !r.flag) fFn += 1;
    if (item.flag === false && r.flag) fFp += 1;
    const allowed = gistAllowed(r.gist, item.text, THEME_NAMES);
    if (!allowed.ok) blocked += 1;
    const kept = item.ids.filter((id) => keeps(r.gist, id));
    if (kept.length) leaks.push({ n: i + 1, kept, blocked: !allowed.ok, reason: allowed.reason, gist: r.gist });
  });
  const times = readings.filter((r) => r.ms > 0).map((r) => r.ms).sort((a, b) => a - b);
  return {
    lenient: prf(tp, fp, fn),
    strict: prf(tp, fpStrict, fn),
    counts: { tp, fp, fpStrict, fn },
    tone: { ok: toneOk, n: toneN, accuracy: round(toneOk / toneN) },
    flag: { ...prf(fTp, fFp, fFn), tp: fTp, fp: fFp, fn: fFn, errors: flagErrors },
    gist: { withPlantedDetails: ITEMS.filter((x) => x.ids.length).length, leaks: leaks.length, unblockedLeaks: leaks.filter((l) => !l.blocked).length, blockedByGuard: blocked, detail: leaks },
    failed,
    unread,
    sources: [...new Set(readings.map((r) => r.source).filter(Boolean))],
    ms: { median: times[Math.floor(times.length / 2)] ?? 0, p90: times[Math.floor(times.length * 0.9)] ?? 0, max: times.at(-1) ?? 0, total: times.reduce((a, b) => a + b, 0) },
    misses,
  };
}

async function run(times = 3) {
  if (state.status === 'running') return 'already running';
  Object.assign(state, { status: 'running', planned: times, runs: [], errors: [], stalls: [], summary: null, startedAt: new Date().toISOString(), finishedAt: null });
  for (let n = 0; n < times; n += 1) {
    state.run = n + 1;
    state.done = 0;
    const t0 = performance.now();
    try {
      const readings = await readOnce();
      state.runs.push({ readings, score: score(readings), wallSeconds: Math.round((performance.now() - t0) / 1000) });
      save(); // a finished run must survive a reload or a closed tab
    } catch (error) {
      state.errors.push({ run: n + 1, code: error.code, message: String(error.message).slice(0, 200) });
      break;
    }
    render();
  }
  state.finishedAt = new Date().toISOString();
  save();
  state.status = 'finished';
  render();
  return 'finished';
}

function save() {
  const perRun = state.runs.map(({ score: s, wallSeconds }) => ({ ...s, wallSeconds }));
  localStorage.setItem(SAVED_KEY, JSON.stringify({ savedAt: new Date().toISOString(), runsPlanned: state.planned, summary: summarize(), perRun, errors: state.errors }));
}

/** Spread over the runs finished so far. */
function summarize() {
  if (!state.runs.length) return null;
  const pick = (f) => state.runs.map((r) => f(r.score));
  const spread = (values) => ({ min: Math.min(...values), mean: round(values.reduce((a, b) => a + b, 0) / values.length), max: Math.max(...values), values });
  const sameThemes = ITEMS.filter((_, i) => new Set(state.runs.map((r) => [...r.readings[i].themes].sort().join('+'))).size === 1).length;
  state.summary = {
    answers: ITEMS.length,
    runs: state.runs.length,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    lenientF1: spread(pick((x) => x.lenient.f1)),
    strictF1: spread(pick((x) => x.strict.f1)),
    lenientPrecision: spread(pick((x) => x.lenient.p)),
    lenientRecall: spread(pick((x) => x.lenient.r)),
    toneAccuracy: spread(pick((x) => x.tone.accuracy)),
    flagRecall: spread(pick((x) => x.flag.r)),
    flagPrecision: spread(pick((x) => x.flag.p)),
    gistLeaks: spread(pick((x) => x.gist.leaks)),
    unblockedLeaks: spread(pick((x) => x.gist.unblockedLeaks)),
    gistsBlockedByGuard: spread(pick((x) => x.gist.blockedByGuard)),
    failedReadings: spread(pick((x) => x.failed)),
    unreadAnswers: spread(pick((x) => x.unread)),
    medianMs: spread(pick((x) => x.ms.median)),
    p90Ms: spread(pick((x) => x.ms.p90)),
    maxMs: spread(pick((x) => x.ms.max)),
    wallSeconds: state.runs.map((r) => r.wallSeconds),
    sameThemeSetInEveryRun: sameThemes,
    stalls: state.stalls,
    sources: [...new Set(state.runs.flatMap((r) => r.score.sources))],
  };
  return state.summary;
}

/** Times `count` answers with or without the length limits in the output schema. */
async function bench(variant, count = 8, from = 0) {
  const schema = structuredClone(readSchema(STUDY.themes));
  if (variant !== 'both') delete schema.properties.gist.maxLength;
  if (variant === 'none') delete schema.properties.themes.maxItems;
  const system = readSystem(STUDY);
  const times = [];
  for (const item of ITEMS.slice(from, from + count)) {
    const step = await router.run('read', { prompt: answerPrompt(item.text), system, schema, confidential: true });
    times.push(step.ms);
  }
  return { variant, times };
}

/**
 * Checks recovery from a generation that runs on, in a real browser and
 * through the SDK: asks for a text long enough to outlast a 15-second limit,
 * then sends a short request, then reads two answers. Results are left on
 * window.__cap.
 */
async function capCheck(limitMs = 15000) {
  const out = (window.__cap = { startedAt: new Date().toISOString(), limitMs });
  const quick = createRouter({ sdk: getSdk(), env, cloudModels, deviceTimeoutMs: limitMs });
  const system = 'You write texts of exactly the length you are asked for.';
  const timed = async (label, prompt) => {
    const t0 = performance.now();
    try {
      const step = await quick.run('discover', { prompt, system, confidential: true });
      out[label] = { ok: true, ms: Math.round(performance.now() - t0), source: step.source, chars: step.text.length, start: step.text.slice(0, 30) };
    } catch (error) {
      out[label] = { ok: false, code: error.code, ms: Math.round(performance.now() - t0) };
    }
  };
  await timed('long', 'Write a story of at least 6,000 words about a lighthouse keeper. Do not stop early and do not summarise.');
  await timed('next', 'Reply with the single word: ready');
  out.readAfter = (await bench('both', 2, 0)).times;
  out.finished = true;
  return out;
}

/** First-run readings of the 64 sample answers, compact, for the recorded sample. */
function sample() {
  const ids = STUDY.themes.map((t) => t.id);
  return state.runs[0].readings.slice(0, 64).map((r) => [r.themes.map((t) => ids.indexOf(t)).join(''), r.sentiment === 'neutral' ? 'u' : r.sentiment[0], r.flag ? 1 : 0, r.gist]);
}

function render() {
  const el = document.getElementById('status');
  if (el) el.textContent = `${state.status} | run ${state.run} | ${state.done}/${state.total} | stops ${state.stalls.length} | errors ${state.errors.length}`;
}

document.getElementById('run')?.addEventListener('click', () => run());
setInterval(render, 1000);
