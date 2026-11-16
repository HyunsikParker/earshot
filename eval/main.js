// On-device measurement harness (concept selection, 2026-11-15).
// Every inference goes through Firebase AI Logic in ONLY_ON_DEVICE mode, so no
// request can leave the machine and no Firebase project is needed to run it.
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { LETTERS, DENSE, FEEDBACK_CONTEXT, CODEBOOK, COMMENTS, PROFILE, CRITERIA } from './data.js';

// Placeholder identifiers: the SDK only checks that these are non-empty, and
// ONLY_ON_DEVICE never builds a network request.
const app = initializeApp({ apiKey: 'on-device-eval', projectId: 'on-device-eval', appId: 'on-device-eval' });
const ai = getAI(app, { backend: new GoogleAIBackend() });

const TEXT_EN = [{ type: 'text', languages: ['en'] }];

function deviceModel(system, schema) {
  const onDeviceParams = {
    createOptions: {
      expectedInputs: TEXT_EN,
      expectedOutputs: TEXT_EN,
      initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
    },
  };
  if (schema) onDeviceParams.promptOptions = { responseConstraint: schema };
  return getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams });
}

const state = { status: 'idle', task: null, done: 0, total: 0, results: {}, errors: [], startedAt: null, finishedAt: null };
window.__eval = { state, run, probe };

async function call(model, prompt) {
  const t0 = performance.now();
  const result = await model.generateContent(prompt);
  const ms = Math.round(performance.now() - t0);
  return { text: result.response.text(), source: result.response.inferenceSource, ms };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// ---------- Task 1: sealing personal details ----------
const DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kind: { type: 'string', enum: ['person', 'address', 'phone', 'email', 'birth_date', 'id_number'] },
        },
        required: ['text', 'kind'],
      },
    },
  },
  required: ['details'],
};

const SEAL_SYSTEM = 'You find personal details in documents so they can be hidden before the document is shared. You answer with JSON only.';
const sealPrompt = (doc) => `List every personal detail in the document below.
Include: names of people; street addresses and postal codes; phone numbers; email addresses; dates of birth; account, case, claim, member, student, employee, passport and reference numbers.
Copy each one exactly as it appears in the document.
Do not include company or office names, amounts of money, or deadlines.

Document:
"""
${doc}
"""`;

const RX = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // email
  /\b(?:\+?\d{1,3}[ .-])?(?:\(\d{3,4}\)[ .-]?|\d{3,4}[ .-])\d{3}[ .-]\d{4}\b/g, // phone
  /\b\d{3}-\d{2}-\d{4}\b/g, // US social security pattern
  /\b(?=[A-Z0-9/-]*\d)[A-Z0-9]{1,}(?:[-/][A-Z0-9]{1,}){1,}\b/g, // hyphenated or slashed codes with digits
  /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{7,}\b/g, // long mixed letter-digit ids
  /\b\d{8,}\b/g, // long numbers
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Close|Crescent)\b\.?/g, // street line
  /\b(?:Apt|Apartment|Unit|Suite|Flat)\s+[A-Z0-9]+\b/g, // unit
  /\b[A-Z]{2}\s\d{5}(?:-\d{4})?\b/g, // US state + ZIP
  /\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/g, // UK postcode
  /\b(?:date of birth|dob|born)\b[:\s]*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|[0-9]{1,2}\s+[A-Z][a-z]+\s+[0-9]{4}|[A-Z][a-z]+\s+[0-9]{1,2},\s*[0-9]{4})/gi, // birth date
];
const DATE_LIKE = /^(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;

function regexSpans(doc) {
  const out = [];
  for (const rx of RX) {
    for (const m of doc.matchAll(rx)) {
      const s = m[1] ?? m[0];
      if (DATE_LIKE.test(s) && !/birth|dob|born/i.test(m[0])) continue;
      out.push(s);
    }
  }
  return out;
}

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function applyMask(doc, strings, personStrings) {
  let sealed = doc;
  const all = [...new Set(strings.filter((s) => s && s.trim().length >= 2))].sort((a, b) => b.length - a.length);
  for (const s of all) sealed = sealed.replace(new RegExp(escapeRx(s.trim()), 'gi'), '██');
  const tokens = new Set();
  for (const p of personStrings) {
    for (const t of p.split(/[\s,.]+/)) {
      if (t.length >= 2 && /^[A-Z]/.test(t) && !/^(Mr|Mrs|Ms|Miss|Dr|Prof|Dear|The|And)$/i.test(t)) tokens.add(t);
    }
  }
  for (const t of tokens) sealed = sealed.replace(new RegExp(`\\b${escapeRx(t)}\\b`, 'g'), '██');
  return sealed;
}

function leaks(sealed, gold) {
  return gold.filter((g) => new RegExp(`(?<![A-Za-z0-9])${escapeRx(g)}(?![A-Za-z0-9])`, 'i').test(sealed));
}

async function taskSeal() {
  const model = deviceModel(SEAL_SYSTEM, DETAIL_SCHEMA);
  const rows = [];
  for (const letter of LETTERS) {
    const r = await call(model, sealPrompt(letter.text));
    const parsed = parseJson(r.text);
    const details = parsed?.details ?? [];
    const nano = details.map((d) => d.text);
    const persons = details.filter((d) => d.kind === 'person').map((d) => d.text);
    const rx = regexSpans(letter.text);
    const sealedNano = applyMask(letter.text, nano, persons);
    const sealedRx = applyMask(letter.text, rx, []);
    const sealedBoth = applyMask(letter.text, [...nano, ...rx], persons);
    const maskedChars = (s) => (s.match(/██/g) || []).length;
    rows.push({
      id: letter.id, ms: r.ms, source: r.source, jsonOk: !!parsed, nDetails: details.length,
      leakNano: leaks(sealedNano, letter.gold), leakRx: leaks(sealedRx, letter.gold), leakBoth: leaks(sealedBoth, letter.gold),
      goldN: letter.gold.length, masksBoth: maskedChars(sealedBoth),
      notInDoc: nano.filter((s) => !letter.text.toLowerCase().includes(String(s).trim().toLowerCase())).length,
      sealedBoth,
    });
    state.done += 1;
  }
  return rows;
}

// ---------- Task 2: answering a question about a letter, device only ----------
async function taskAsk() {
  const model = deviceModel('You help people understand official letters. Answer in one or two short sentences using only facts stated in the letter.');
  const rows = [];
  for (const letter of LETTERS) {
    const r = await call(model, `Letter:\n"""\n${letter.text}\n"""\n\nQuestion: ${letter.question}`);
    const hits = letter.answer.map((a) => new RegExp(a, 'i').test(r.text));
    rows.push({ id: letter.id, ms: r.ms, ok: hits.every(Boolean), hits, text: r.text.slice(0, 260) });
    state.done += 1;
  }
  return rows;
}

// ---------- Task 3: plain-language rewrite ----------
const wordsPerSentence = (t) => {
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const words = t.trim().split(/\s+/).length;
  return Math.round((words / Math.max(1, sentences.length)) * 10) / 10;
};

async function taskPlain() {
  const model = deviceModel('You rewrite official wording in plain English for a general reader. Keep every number, date and deadline. Use short sentences. Output only the rewritten text.');
  const rows = [];
  for (const item of DENSE) {
    const r = await call(model, `Rewrite in plain English:\n${item.text}`);
    const kept = item.keep.map((k) => new RegExp(k, 'i').test(r.text));
    rows.push({ ms: r.ms, kept: kept.every(Boolean), keptDetail: kept, wpsBefore: wordsPerSentence(item.text), wpsAfter: wordsPerSentence(r.text), lenRatio: Math.round((r.text.length / item.text.length) * 100) / 100, text: r.text.slice(0, 300) });
    state.done += 1;
  }
  return rows;
}

// ---------- Task 4: coding feedback comments against a codebook ----------
const CODE_SCHEMA = {
  type: 'object',
  properties: {
    themes: { type: 'array', items: { type: 'string', enum: CODEBOOK.map((c) => c.id) } },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'mixed', 'neutral'] },
    safety_report: { type: 'boolean' },
    gist: { type: 'string' },
  },
  required: ['themes', 'sentiment', 'safety_report', 'gist'],
};

const codeSystem = `You label survey comments for an analyst. Context: ${FEEDBACK_CONTEXT}
Themes:
${CODEBOOK.map((c) => `- ${c.id}: ${c.definition}`).join('\n')}
Rules: choose every theme the comment is clearly about, and none if no theme fits. sentiment is the writer's overall tone. safety_report is true only when the comment reports harassment, discrimination, or feeling unsafe. gist is one neutral sentence, at most 15 words, with no names, emails or other identifying details. You answer with JSON only.`;

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

async function taskCode() {
  const model = deviceModel(codeSystem, CODE_SCHEMA);
  const rows = [];
  for (const c of COMMENTS) {
    const r = await call(model, `Comment: "${c.text}"`);
    const p = parseJson(r.text) || {};
    const themes = Array.isArray(p.themes) ? [...new Set(p.themes)] : [];
    rows.push({
      ms: r.ms, jsonOk: !!p.sentiment, themes, sentiment: p.sentiment, flag: p.safety_report, gist: (p.gist || '').slice(0, 140),
      themeOk: c.themes === null ? null : sameSet(themes, c.themes), goldThemes: c.themes,
      sentimentOk: c.sentiment.includes(p.sentiment), flagOk: p.safety_report === c.flag,
      gistLeak: /@|dana/i.test(p.gist || ''),
    });
    state.done += 1;
  }
  return rows;
}

// ---------- Task 5: matching a private profile against a public rule ----------
const MATCH_SCHEMA = {
  type: 'object',
  properties: { eligible: { type: 'string', enum: ['yes', 'no', 'unclear'] }, reason: { type: 'string' } },
  required: ['eligible', 'reason'],
};

async function taskMatch() {
  const model = deviceModel('You check whether a person meets an eligibility rule. Use only the facts in the profile. You answer with JSON only.', MATCH_SCHEMA);
  const rows = [];
  for (const c of CRITERIA) {
    const r = await call(model, `Profile: ${PROFILE}\n\nRule: ${c.text}\n\nIs this person eligible under this rule?`);
    const p = parseJson(r.text) || {};
    rows.push({ ms: r.ms, got: p.eligible, want: c.eligible, ok: p.eligible === c.eligible, reason: (p.reason || '').slice(0, 140) });
    state.done += 1;
  }
  return rows;
}

const TASKS = { seal: [taskSeal, LETTERS.length], ask: [taskAsk, LETTERS.length], plain: [taskPlain, DENSE.length], code: [taskCode, COMMENTS.length], match: [taskMatch, CRITERIA.length] };

async function probe() {
  const out = { ua: navigator.userAgent, hasLanguageModel: 'LanguageModel' in window };
  if (out.hasLanguageModel) {
    out.textOnly = await LanguageModel.availability({ expectedInputs: TEXT_EN, expectedOutputs: TEXT_EN });
    try {
      out.textAndImage = await LanguageModel.availability({ expectedInputs: [...TEXT_EN, { type: 'image' }], expectedOutputs: TEXT_EN });
    } catch (e) { out.textAndImage = `error: ${e.name}`; }
    try { out.params = await LanguageModel.params?.(); } catch (e) { out.params = `error: ${e.name}`; }
  }
  return out;
}

async function run(names = Object.keys(TASKS)) {
  if (state.status === 'running') return 'already running';
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.done = 0;
  state.total = names.reduce((n, k) => n + TASKS[k][1], 0);
  for (const name of names) {
    state.task = name;
    try {
      state.results[name] = await TASKS[name][0]();
    } catch (e) {
      state.errors.push({ task: name, name: e.name, code: e.code, message: String(e.message).slice(0, 300) });
    }
    render();
  }
  state.status = 'finished';
  state.finishedAt = new Date().toISOString();
  render();
  return 'finished';
}

function render() {
  const el = document.getElementById('status');
  if (el) el.textContent = `${state.status} | task ${state.task} | ${state.done}/${state.total} | errors ${state.errors.length}`;
}

document.getElementById('run')?.addEventListener('click', () => run());
setInterval(render, 1000);
