import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import './styles.css';
import { getSdk } from './ai/firebase.js';
import { createRouter } from './ai/router.js';
import { CLOUD_READS_PER_DAY, reserveHostedCloudRead } from './ai/cloud-read-budget.js';
import { deviceAvailability, deviceReady, deviceCanBecomeReady } from './ai/device.js';
import { cloudModels, isCloudConfigured } from './config/firebase-config.js';
import { parseInput } from './study/parse.js';
import { normalizeThemes, parseThemeList, suggestPrompt, discoverPrompt, sampleAnswers, THEME_LIST_SCHEMA, THEME_SYSTEM, MAX_THEMES } from './study/codebook.js';
import { readAll } from './study/reader.js';
import { tally } from './study/aggregate.js';
import { buildOutbound, checkOutbound, outboundText } from './study/outbound.js';
import { gistAllowed } from './study/guard.js';
import { findReportIssues, reportPrompt, shortenPrompt, REPORT_SYSTEM } from './study/report.js';
import { sheetFacts, fallbackReport, pickPrompt, pickSchema, parsePicks, PICK_SYSTEM } from './study/facts.js';
import { loadStudy, saveStudy, clearStudy, newStudy } from './store.js';
import { sampleStudy, SAMPLE_SIZE } from './sample/conference.js';
import { RECORDED_ON, recordedReadings, matchesRecorded } from './sample/recorded.js';
import { $, esc, formatBytes, plural } from './ui/dom.js';
import { tallyMarks } from './ui/tally.js';
import { renderMarkdown } from './ui/markdown.js';

const app = $('#app');
const hosted = location.hostname === 'hyunsikparker.github.io';

const state = {
  study: loadStudy(),
  device: 'checking',
  download: null,
  online: navigator.onLine,
  run: { active: false, stop: false, problem: '' },
  filter: 'all',
  open: new Set(),
  editing: new Set(),
  pane: 'answers',
  intakeProblem: '',
  frameProblem: '',
  suggest: { busy: false, note: '', problem: '' },
  report: { busy: false, live: '', problem: '' },
  lastCounts: {},
  storageFull: false,
};

const router = createRouter({
  sdk: getSdk(),
  env: { deviceAvailability, online: () => navigator.onLine, cloudConfigured: isCloudConfigured },
  cloudModels,
  reserveCloudRead: hosted ? reserveHostedCloudRead : undefined,
  log(entry) {
    console.info('[earshot]', entry.route, entry.mode, '->', entry.source ?? `failed (${entry.error})`, entry.fallback ? `fallback: ${entry.fallback.reason}` : '', `${entry.ms} ms`);
    if (entry.route === 'read' || !state.study) return;
    const { route, label, mode, source, ms, fallback, error, cloudError, at } = entry;
    state.study.steps = [...(state.study.steps ?? []), { route, label, mode, source, ms, fallback, error, cloudError, at }].slice(-40);
    renderAudit();
  },
});

// ---------- wording ----------

const WHY = {
  'not-configured': 'the cloud is not connected',
  offline: 'this computer is offline',
  quota: 'the cloud model reached its limit',
  blocked: 'the cloud refused the request',
  unavailable: 'the cloud model was unavailable',
  'incomplete-response': 'the cloud did not return a complete response',
  network: 'the cloud could not be reached',
  'cloud-error': 'the cloud could not finish',
  'device-unavailable': 'this browser has no local model',
  'device-not-ready': 'the local model is still downloading',
  'device-error': 'the local model could not finish',
  'device-timeout': 'the local model took too long',
  'cloud-read-limit': 'this browser could not reserve another cloud reading request',
  'no-path': 'neither the cloud nor a local model was available',
};

function explain(error) {
  if (error?.name === 'OutboundBlocked') return error.message;
  switch (error?.code) {
    case 'device-unavailable':
      return 'This browser has no local model, so confidential answers cannot be read here. Open Earshot in Chrome on a desktop computer that has built-in AI.';
    case 'device-not-ready':
      return 'The local model has not finished downloading.';
    case 'device-error':
      return 'The local model stopped before it finished. Try again.';
    case 'device-timeout':
      return 'The local model took too long and was stopped. Try again.';
    case 'no-path':
      return 'Neither the local model nor the cloud is available right now.';
    case 'quota':
      return 'The cloud model has reached its limit for now. Try again in a few minutes.';
    case 'cloud-read-limit':
      return `The hosted demo allows ${CLOUD_READS_PER_DAY} cloud reading requests per browser each day. Read on this computer or try again after midnight UTC.`;
    case 'blocked':
      return 'The cloud refused the request.';
    case 'offline':
    case 'network':
      return 'The cloud cannot be reached. Check the connection.';
    default:
      return 'That did not work. Try again.';
  }
}

const place = (source) => (source === 'in_cloud' ? 'in the cloud' : 'on this computer');
const cloudUsable = () => state.online && isCloudConfigured();

// ---------- keyboard focus ----------

// Parts of the page are redrawn while answers are being read. Whoever is
// working from the keyboard must not lose their place when that happens.
function rememberFocus(container) {
  const active = document.activeElement;
  if (!active || active === container || !container.contains(active)) return () => {};
  const d = active.dataset;
  const selector = ['action', 'id', 'theme', 'key', 'index', 'input', 'change', 'pane'].map((k) => (d[k] === undefined ? '' : `[data-${k}="${CSS.escape(d[k])}"]`)).join('');
  const region = active.closest('[id]')?.id;
  const caret = active.matches('input[type="text"], textarea') ? [active.selectionStart, active.selectionEnd] : null;
  return () => {
    if (document.activeElement !== container && container.contains(document.activeElement)) return;
    const next = (selector && container.querySelector(selector)) || (region && document.getElementById(region)?.querySelector('button:not([disabled]), input, summary'));
    if (!next) return;
    next.focus({ preventScroll: true });
    if (caret) next.setSelectionRange(...caret);
  };
}

// ---------- saving ----------

let saveTimer = 0;
function persistNow() {
  clearTimeout(saveTimer);
  if (state.study) state.storageFull = !saveStudy(state.study);
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 400);
}

// ---------- top bar ----------

function renderBar() {
  $('#brand').innerHTML = `${tallyMarks(5, { label: 'Earshot' })}<span>Earshot</span>`;
  $('#study-title').textContent = state.study ? state.study.title : '';
  const device = {
    checking: ['Checking the local model', false],
    available: ['Local model ready', true],
    downloadable: ['Local model not downloaded yet', false],
    downloading: [state.download == null ? 'Downloading the local model' : `Downloading the local model, ${Math.round(state.download * 100)}%`, false],
  }[state.device] ?? ['No local model in this browser', false];
  const cloud = !state.online ? ['Offline', false] : isCloudConfigured() ? ['Cloud ready', true] : ['Cloud not connected', false];
  $('#status').innerHTML = [device, cloud].map(([text, on]) => `<span class="status" data-on="${on}">${esc(text)}</span>`).join('');
}

async function refreshDevice() {
  const next = await deviceAvailability();
  if (!(state.device === 'downloading' && next === 'downloadable')) state.device = next;
  renderBar();
  renderProgress();
}

// ---------- start ----------

function renderStart() {
  app.innerHTML = `
    <section class="start">
      <div>
        <h1 tabindex="-1">Read every answer. Repeat none of them.</h1>
        <p class="start__lede">Earshot sorts the open-ended answers from a survey you promised to keep confidential. They are read on this computer. The cloud gets only the counts and writes the report from them.</p>
        <div class="crossing">
          <div class="crossing__side">
            <h2>Stays on this computer</h2>
            <p class="slip">The Wi-Fi dropped every time more than fifty people were in the main hall.</p>
            <p class="slip">No vegan option at lunch on day two, and the coffee ran out by 10.</p>
            <p class="slip">Rooms were freezing and the chairs were painful after an hour.</p>
          </div>
          <div class="crossing__side">
            <h2>Goes to the cloud</h2>
            <dl>
              <dt>Venue</dt><dd>${tallyMarks(2, { label: 'Venue' })}</dd>
              <dt>Food</dt><dd>${tallyMarks(1, { label: 'Food' })}</dd>
            </dl>
          </div>
        </div>
      </div>
      <form class="intake" data-form="intake">
        <label for="paste">Your answers</label>
        <textarea id="paste" name="paste" spellcheck="false" placeholder="Paste one answer per line, or a table copied from a spreadsheet"></textarea>
        ${state.intakeProblem ? `<p class="problem" role="alert">${esc(state.intakeProblem)}</p>` : ''}
        <div class="intake__actions">
          <button class="btn btn--primary" type="submit">Continue</button>
          <label class="btn file">Choose a CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-change="file" /></label>
        </div>
        <div class="intake__sample">
          <button class="linkbtn" type="button" data-action="sample">Open the sample study</button>
          <span class="hint">${SAMPLE_SIZE} made-up answers from a conference that does not exist.</span>
        </div>
      </form>
    </section>`;
}

function intake(text, title = 'Untitled study') {
  if (!text.trim()) {
    state.intakeProblem = 'There is nothing to read yet. Paste at least one answer.';
    return renderStart();
  }
  const parsed = parseInput(text);
  if (parsed.answers.length === 0) {
    state.intakeProblem = 'No answers were found in that text.';
    return renderStart();
  }
  state.intakeProblem = '';
  state.study = newStudy({ title, answers: parsed.answers, themes: [{ name: '', definition: '' }, { name: '', definition: '' }] });
  state.study.intake = { kind: parsed.kind, answerColumn: parsed.answerColumn, groupColumn: parsed.groupColumn };
  persistNow();
  return render();
}

// ---------- frame: question and themes ----------

const confidentialHint = (on) =>
  on
    ? 'Only the local model on this computer reads them. If this browser has none, they are not read at all.'
    : `The local model reads them when it can. Otherwise the cloud model may read them.${hosted ? ` This demo allows ${CLOUD_READS_PER_DAY} cloud reading requests per browser each day (UTC).` : ''}`;

function intakeNote(study) {
  const from = study.intake;
  if (!from || from.kind !== 'table') return 'One answer per line.';
  return `Taken from the column "${from.answerColumn}"${from.groupColumn ? `, grouped by "${from.groupColumn}"` : ''}.`;
}

function renderFrame() {
  const s = state.study;
  const restore = rememberFocus(app);
  const busy = state.suggest.busy ? 'disabled' : '';
  const rows = s.themes
    .map(
      (t, i) => `
        <li class="theme-row">
          <input type="text" data-input="theme-name" data-index="${i}" value="${esc(t.name)}" placeholder="Theme" aria-label="Theme ${i + 1} name" maxlength="40" />
          <input type="text" data-input="theme-definition" data-index="${i}" value="${esc(t.definition)}" placeholder="What belongs here" aria-label="Theme ${i + 1} definition" maxlength="200" />
          <button class="linkbtn" type="button" data-action="remove-theme" data-index="${i}" aria-label="Remove theme ${i + 1}">Remove</button>
        </li>`,
    )
    .join('');
  app.innerHTML = `
    <section class="frame">
      <div class="frame__head">
        <h1 tabindex="-1">${plural(s.answers.length, 'answer')} to read</h1>
        <p class="hint">${s.sample ? 'Sample study. Every answer in it is made up.' : esc(intakeNote(s))}</p>
        <div class="frame__recorded" id="frame-recorded">${canShowRecorded(s) ? RECORDED_CHOICE : ''}</div>
      </div>
      <div>
        <div class="field"><label for="title">Name of this study</label><input id="title" type="text" data-input="title" value="${esc(s.title)}" /></div>
        <div class="field"><label for="question">The question you asked</label><input id="question" type="text" data-input="question" value="${esc(s.question)}" placeholder="What should we change next year?" /></div>
        <div class="field"><label for="context">About the survey</label><input id="context" type="text" data-input="context" value="${esc(s.context)}" placeholder="Who answered, and when" /></div>
        <div class="field">
          <label class="check"><input type="checkbox" data-change="confidential" ${s.confidential ? 'checked' : ''} /><span class="field__label">These answers are confidential</span></label>
          <p class="hint" id="confidential-hint">${confidentialHint(s.confidential)}</p>
        </div>
      </div>
      <div>
        <h2>Themes to sort by</h2>
        <ul class="themes-edit">${rows}</ul>
        <div class="frame__tools">
          <button class="linkbtn" type="button" data-action="add-theme" ${s.themes.length >= MAX_THEMES ? 'disabled' : ''}>Add a theme</button>
          <button class="linkbtn" type="button" data-action="suggest-question" ${busy}>Suggest themes from the question</button>
          <button class="linkbtn" type="button" data-action="suggest-sample" ${busy}>Suggest themes from a sample of answers</button>
        </div>
        <p class="hint" aria-live="polite">${esc(state.suggest.busy ? 'Thinking about themes.' : state.suggest.note)}</p>
        ${state.suggest.problem ? `<p class="problem" role="alert">${esc(state.suggest.problem)}</p>` : ''}
      </div>
      <div class="frame__foot">
        <button class="btn btn--primary" type="button" data-action="start-reading">Start reading</button>
        <button class="linkbtn" type="button" data-action="discard">Discard and start over</button>
        ${state.frameProblem ? `<p class="problem" role="alert">${esc(state.frameProblem)}</p>` : ''}
      </div>
    </section>`;
  restore();
}

async function suggestThemes(from) {
  const s = state.study;
  if (from === 'question' && !s.question.trim()) {
    state.suggest = { busy: false, note: '', problem: 'Type the question you asked first.' };
    return renderFrame();
  }
  state.suggest = { busy: true, note: '', problem: '' };
  renderFrame();
  try {
    const out =
      from === 'question'
        ? await router.run('suggest', { prompt: suggestPrompt(s), system: THEME_SYSTEM, schema: THEME_LIST_SCHEMA })
        : await router.run('discover', { prompt: discoverPrompt({ question: s.question, sample: sampleAnswers(s.answers) }), system: THEME_SYSTEM, schema: THEME_LIST_SCHEMA, confidential: s.confidential });
    const suggested = parseThemeList(out.text);
    const kept = s.themes.filter((t) => t.name.trim());
    const known = new Set(kept.map((t) => t.name.trim().toLowerCase()));
    const added = suggested.filter((t) => !known.has(t.name.toLowerCase())).slice(0, MAX_THEMES - kept.length);
    s.themes = [...kept, ...added.map(({ name, definition }) => ({ name, definition }))];
    const because = out.fallback ? `, because ${WHY[out.fallback.reason] ?? 'the other path was not available'}` : '';
    state.suggest = {
      busy: false,
      problem: '',
      note: added.length ? `${plural(added.length, 'theme')} suggested ${place(out.source)}${from === 'sample' ? ' from 12 of the answers' : ' from your question'}${because}.` : 'No new themes came back. Add your own, or try again.',
    };
    persistNow();
  } catch (error) {
    state.suggest = { busy: false, note: '', problem: explain(error) };
  }
  if (state.study === s && !s.started) renderFrame();
}

function startStudy() {
  const s = state.study;
  const themes = normalizeThemes(s.themes);
  if (!s.question.trim()) state.frameProblem = 'Type the question you asked, so the answers are read in context.';
  else if (themes.length < 2) state.frameProblem = 'Name at least two themes to sort the answers by.';
  else state.frameProblem = '';
  if (state.frameProblem) return renderFrame();
  s.themes = themes;
  s.started = true;
  persistNow();
  render();
  return beginReading();
}

// ---------- workspace ----------

function renderWork() {
  const tab = (pane, text) => `<button type="button" data-action="tab" data-pane="${pane}" aria-current="${state.pane === pane}">${text}</button>`;
  app.innerHTML = `
    <nav class="tabs" aria-label="Parts of the study">${tab('themes', 'Themes')}${tab('answers', 'Answers')}${tab('sheet', 'Report')}</nav>
    <div class="work" data-pane="${state.pane}">
      <aside class="pane pane--themes" id="pane-themes" aria-label="Themes"></aside>
      <section class="pane pane--answers" id="pane-answers" aria-label="Answers"></section>
      <aside class="pane pane--sheet" aria-label="What leaves this computer">
        <div class="sheet-block" id="sheet-block"></div>
        <div class="report" id="report"></div>
        <details class="audit" id="audit"></details>
      </aside>
    </div>`;
  renderThemes();
  renderAnswers();
  renderSheetBlock();
  renderReport();
  renderAudit();
}

function toneLine(theme) {
  const parts = ['negative', 'positive', 'mixed', 'neutral'].filter((k) => theme[k] > 0).map((k) => `${theme[k]} ${k}`);
  return parts.length ? `<span class="theme__tone">${parts.join(', ')}</span>` : '';
}

function renderThemes() {
  const el = $('#pane-themes');
  if (!el) return;
  const restore = rememberFocus(el);
  const t = tally(state.study);
  const row = (key, name, count, extra = '', cls = '') => {
    const grew = (state.lastCounts[key] ?? 0) < count;
    state.lastCounts[key] = count;
    return `<button class="theme ${cls}" type="button" data-action="filter" data-key="${esc(key)}" aria-pressed="${state.filter === key}">
      <span class="theme__name">${esc(name)}</span><span class="theme__count">${count}</span>${count ? tallyMarks(count, { label: name, animate: grew }) : ''}${extra}</button>`;
  };
  el.innerHTML = `
    <h2 tabindex="-1">Themes</h2>
    <button class="theme" type="button" data-action="filter" data-key="all" aria-pressed="${state.filter === 'all'}"><span class="theme__name">All answers</span><span class="theme__count">${t.answers}</span></button>
    ${t.themes.map((x) => row(x.id, x.name, x.count, toneLine(x))).join('')}
    ${row('none', 'No theme', t.noTheme)}
    ${row('flag', 'Safety reports', t.safetyReports, '', 'theme--flag')}
    <div class="progress" id="progress"></div>`;
  renderProgress();
  restore();
}

function canShowRecorded(study) {
  return !state.run.active && matchesRecorded(study) && !study.answers.some((answer) => answer.reading);
}

const RECORDED_CHOICE = `<button class="btn" type="button" data-action="recorded">Show labels recorded on another computer</button>
    <p class="hint">Recorded labels need no download. Or start reading and pause after a few answers; the report uses what was counted so far. A full read of the ${SAMPLE_SIZE} answers took about 15 minutes on an M4 Mac laptop.</p>`;

function renderProgress() {
  const s = state.study;
  if (!s?.started) {
    const choice = $('#frame-recorded');
    const show = canShowRecorded(s);
    if (choice && show !== Boolean(choice.firstElementChild)) choice.innerHTML = show ? RECORDED_CHOICE : '';
    return;
  }
  const total = s.answers.length;
  const done = s.answers.filter((a) => a.reading).length;
  const from = (source) => s.answers.filter((a) => a.reading?.source === source).length;
  const inCloud = from('in_cloud');
  const where = inCloud === 0 ? 'on this computer' : inCloud === done ? 'in the cloud' : `(${done - inCloud} on this computer, ${inCloud} in the cloud)`;
  let line = done === total ? `All ${plural(total, 'answer')} read ${where}.` : state.run.active ? `Reading ${where}: ${done} of ${total}` : `${done} of ${total} read`;
  if (from('recorded')) line = `Showing labels recorded on another computer on ${RECORDED_ON}. Nothing was read in this browser.`;
  if (state.run.active && state.device === 'downloading') {
    line = state.download == null ? 'Downloading the local model. Reading starts when it is ready.' : `Downloading the local model, ${Math.round(state.download * 100)}%. Reading starts when it is ready.`;
  }
  let button = '';
  if (state.run.active) button = `<button class="btn" type="button" data-action="pause" ${state.run.stop ? 'aria-disabled="true"' : ''}>${state.run.stop ? 'Pausing' : 'Pause'}</button>`;
  else if (done < total) button = `<button class="btn btn--primary" type="button" data-action="read">${done === 0 ? 'Start reading' : 'Continue reading'}</button>`;
  const body = `
    <p aria-live="polite">${esc(line)}</p>
    <div class="progress__bar" role="progressbar" aria-label="Answers read" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
    ${state.run.problem ? `<p class="notice notice--stop" role="alert">${esc(state.run.problem)}</p>` : ''}
    ${state.storageFull ? '<p class="notice notice--stop" role="alert">This browser has no room left to save the study. Labels will be lost when the page closes.</p>' : ''}
    ${button}${canShowRecorded(s) ? RECORDED_CHOICE : ''}`;
  const links = '<p><button class="linkbtn" type="button" data-action="change-themes">Change the themes</button><br /><button class="linkbtn" type="button" data-action="discard">Start a new study</button></p>';
  // The same block sits above the answers on a narrow screen, where the themes are a separate part.
  for (const [id, extra] of [['progress', links], ['progress-narrow', '']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    const restore = rememberFocus(el);
    el.innerHTML = body + extra;
    restore();
  }
}

const FILTER_NAMES = { all: 'All answers', none: 'No theme', flag: 'Safety reports' };
const NARROW = window.matchMedia('(max-width: 62rem)');

function showPane(pane) {
  state.pane = pane;
  $('.work').dataset.pane = pane;
  app.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.pane === pane)));
  if (NARROW.matches) $('.tabs').scrollIntoView({ block: 'start' });
}

function visibleAnswers() {
  const f = state.filter;
  if (f === 'all') return state.study.answers;
  return state.study.answers.filter((a) => {
    const r = a.reading;
    if (!r || r.failed) return false;
    if (f === 'none') return r.themes.length === 0;
    if (f === 'flag') return r.flag;
    return r.themes.includes(f);
  });
}

function slipHtml(a) {
  const r = a.reading;
  const open = state.open.has(a.id) || Boolean(r?.failed);
  const original = open ? `<p class="slip__original">${esc(a.text)}</p>` : '';
  const showOriginal = `<button class="linkbtn" type="button" data-action="original" data-id="${a.id}" aria-expanded="${open}">${open ? 'Hide the original' : 'Show the original'}</button>`;
  if (!r) {
    return `<li class="slip" id="slip-${a.id}"><p class="slip__text slip__text--waiting">Waiting to be read</p>${original}<div class="slip__meta"><span class="slip__actions">${showOriginal}</span></div></li>`;
  }
  const editing = state.editing.has(a.id);
  const name = new Map(state.study.themes.map((t) => [t.id, t.name]));
  const allowed = gistAllowed(r.gist, a.text, state.study.themes.map((t) => t.name));
  const gist = r.failed ? 'The local model could not label this answer. Label it by hand.' : r.gist || 'No gist was written for this answer.';
  const text = a.shareGist && allowed.ok ? `<span class="marked">${esc(gist)}</span>` : esc(gist);
  const labels = editing
    ? state.study.themes.map((t) => `<button class="circled" type="button" data-action="toggle-theme" data-id="${a.id}" data-theme="${t.id}" aria-pressed="${r.themes.includes(t.id)}">${esc(t.name)}</button>`).join('') +
      `<button class="stamp" type="button" data-action="toggle-flag" data-id="${a.id}" aria-pressed="${r.flag}">Safety report</button>`
    : (r.themes.map((id) => `<span class="circled">${esc(name.get(id) ?? id)}</span>`).join('') || '<span class="tone">no theme</span>') +
      `<span class="tone">${esc(r.sentiment)}</span>${r.flag ? '<span class="stamp">Safety report</span>' : ''}${r.edited ? '<span class="tone">changed by you</span>' : ''}`;
  const share = editing && !r.failed
    ? `<label class="share"><input type="checkbox" data-change="share" data-id="${a.id}" ${a.shareGist && allowed.ok ? 'checked' : ''} ${allowed.ok ? '' : 'disabled'} /><span>The cloud may see this gist as an example</span>${allowed.ok ? '' : `<span class="share__why">${esc(allowed.reason)}</span>`}</label>`
    : '';
  return `<li class="slip" id="slip-${a.id}">
    <p class="slip__text${r.failed ? ' slip__text--waiting' : ''}">${text}</p>${original}
    <div class="slip__meta">${labels}<span class="slip__actions">${showOriginal}<button class="linkbtn" type="button" data-action="edit" data-id="${a.id}" aria-expanded="${editing}">${editing ? 'Done' : 'Change labels'}</button></span></div>${share}
  </li>`;
}

function renderAnswers() {
  const el = $('#pane-answers');
  if (!el) return;
  const restore = rememberFocus(el);
  const list = visibleAnswers();
  const title = FILTER_NAMES[state.filter] ?? state.study.themes.find((t) => t.id === state.filter)?.name ?? 'Answers';
  el.innerHTML = `
    <div class="answers__bar"><h2 tabindex="-1">${esc(title)}</h2><span class="hint">${plural(list.length, 'answer')}</span></div>
    <div class="progress only-narrow" id="progress-narrow"></div>
    ${list.length ? `<ul class="slips">${list.map(slipHtml).join('')}</ul>` : `<p class="empty">${state.filter === 'flag' ? 'No safety reports so far.' : 'No answers here yet.'}</p>`}`;
  renderProgress();
  restore();
}

function updateSlip(answer) {
  const el = document.getElementById(`slip-${answer.id}`);
  const belongs = visibleAnswers().includes(answer);
  if (el && belongs) {
    const restore = rememberFocus(el.parentElement);
    el.outerHTML = slipHtml(answer);
    restore();
  } else if (el || belongs) renderAnswers();
}

function renderSheetBlock() {
  const el = $('#sheet-block');
  if (!el) return;
  const s = state.study;
  const restore = rememberFocus(el);
  const wasOpen = Boolean($('#exact', el)?.open);
  const sheet = buildOutbound(s);
  let size = '';
  let blocked = '';
  try {
    size = formatBytes(checkOutbound(sheet, s).bytes);
  } catch (error) {
    blocked = error.message;
  }
  const rows = [...sheet.tallies.map((t) => [t.theme, t.answers]), ['No theme', sheet.answers_with_no_theme], ['Safety reports', sheet.safety_reports]]
    .map(([label, n]) => `<tr><th scope="row">${esc(label)}</th><td>${n}</td></tr>`)
    .join('');
  const gists = sheet.approved_gists?.length ?? 0;
  const willSend = cloudUsable();
  el.innerHTML = `
    <h2>Leaves this computer</h2>
    <div class="sheet">
      <table><tbody>${rows}</tbody></table>
      <p class="sheet__size">${sheet.answers_read} of ${plural(sheet.answers_received, 'answer')} counted${gists ? `, with ${plural(gists, 'gist')} you approved` : ''}. ${size ? `${size} with your question and theme names.` : ''}</p>
      <details id="exact" ${wasOpen ? 'open' : ''}><summary>See the exact text</summary><pre>${esc(outboundText(sheet))}</pre></details>
    </div>
    <div class="sheet__send">
      ${blocked ? `<p class="problem" role="alert">${esc(blocked)}</p>` : ''}
      <button class="btn btn--primary" type="button" data-action="write-report" ${sheet.answers_read === 0 || blocked ? 'disabled' : ''} ${state.report.busy ? 'aria-disabled="true"' : ''}>${willSend ? 'Send the counts and write the report' : 'Summarise the counts here'}</button>
      ${willSend ? '' : `<p class="hint">${state.online ? 'The cloud is not connected, so nothing will be sent.' : 'This computer is offline, so nothing will be sent.'}</p>`}
      ${state.report.problem ? `<p class="problem" role="alert">${esc(state.report.problem)}</p>` : ''}
    </div>`;
  restore();
}

function reportSource(r) {
  const why = WHY[r.reason] ?? 'the cloud could not be used';
  let line = 'Written in the cloud from the tally sheet.';
  if (r.source === 'on_device') line = `Put together on this computer because ${why}. The local model chose which counts to lead with.`;
  else if (r.source === 'page') line = `Put together by this page because ${why} and this browser has no local model.`;
  return r.shortened ? `${line} Shortened ${place(r.shortened)}.` : line;
}

function reportCheck(r, study) {
  const statements = [...new Set(findReportIssues(r.text, r.counts ?? buildOutbound(study)).map(({ statement }) => statement))];
  const basis = r.counts ? 'the report tally' : 'the current tally';
  const more = statements.length > 1 ? ` (${statements.length - 1} more flagged)` : '';
  const line = statements.length
    ? `Count check: “${statements[0]}” is not supported by ${basis}${more}.`
    : `Count check: Every number matched ${basis}.`;
  return `<p class="report__check${statements.length ? ' report__check--flagged' : ''}" role="status">${esc(line)}</p>`;
}

function renderReport() {
  const el = $('#report');
  if (!el) return;
  const restore = rememberFocus(el);
  const r = state.study.report;
  if (state.report.busy) {
    const progress = state.report.live
      ? renderMarkdown(state.report.live)
      : `<p class="hint">${esc(state.report.hint ?? 'Writing.')}</p>`;
    el.innerHTML = `<h2>Report</h2><div class="report__body" aria-live="polite">${progress}</div>`;
  } else if (r) {
    el.innerHTML = `
      <h2>Report</h2>
      <div class="report__body">${renderMarkdown(r.text)}</div>
      ${reportCheck(r, state.study)}
      <p class="report__source" role="status">${esc(reportSource(r))}</p>
      <div class="report__actions">
        ${r.source === 'in_cloud' ? '<button class="linkbtn" type="button" data-action="shorten">Shorten</button>' : ''}
        <button class="linkbtn" type="button" data-action="copy">Copy</button>
        <button class="linkbtn" type="button" data-action="print">Print</button>
      </div>`;
  } else {
    el.innerHTML = '';
  }
  restore();
}

function renderAudit() {
  const el = $('#audit');
  if (!el || !state.study) return;
  const read = state.study.answers.filter((a) => a.reading);
  const inCloud = read.filter((a) => a.reading.source === 'in_cloud').length;
  const lines = [];
  const recorded = read.filter((a) => a.reading.source === 'recorded').length;
  if (recorded) lines.push(`<li>${plural(recorded, 'answer')}: labels recorded on another computer on ${RECORDED_ON}, not read in this browser</li>`);
  if (read.length > recorded) {
    lines.push(`<li>${plural(read.length - recorded - inCloud, 'answer')} read on this computer, ${inCloud} in the cloud<br /><code>${state.study.confidential ? 'only_on_device' : 'prefer_on_device'}</code></li>`);
  }
  for (const step of state.study.steps ?? []) {
    const outcome = step.error
      ? `did not finish, because ${esc(WHY[step.cloudError ?? step.error] ?? 'of an error')}`
      : `${place(step.source)}${step.fallback ? `, because ${esc(WHY[step.fallback.reason] ?? 'the other path was not available')}` : ''}`;
    lines.push(`<li>${esc(step.label)}: ${outcome}<br /><code>${esc(step.mode)}</code> <span class="hint">${(step.ms / 1000).toFixed(1)} s</span></li>`);
  }
  el.innerHTML = `<summary>Where each step ran</summary>${lines.length ? `<ol>${lines.join('')}</ol>` : '<p class="hint">Nothing has run yet.</p>'}`;
}

// ---------- running things ----------

async function beginReading() {
  const s = state.study;
  if (state.run.active) return;
  state.run = { active: true, stop: false, problem: '' };
  renderProgress();
  try {
    state.device = await deviceAvailability();
    if (deviceCanBecomeReady(state.device)) {
      // First use: the model downloads once. Confidential answers wait for it.
      // Other studies start in the cloud and move to the device when it is ready.
      state.device = 'downloading';
      renderBar();
      renderProgress();
      const download = router
        .prepareDevice((fraction) => {
          state.download = fraction;
          renderBar();
          renderProgress();
        })
        .then(refreshDevice);
      if (s.confidential) await download;
      else download.catch(() => {});
    }
    renderBar();
    await readAll({
      study: s,
      router,
      shouldStop: () => state.run.stop || state.study !== s,
      onReading(answer) {
        persist();
        updateSlip(answer);
        renderThemes();
        renderSheetBlock();
        renderAudit();
      },
    });
  } catch (error) {
    state.run.problem = explain(error);
    refreshDevice();
    renderThemes();
    renderAnswers();
    renderSheetBlock();
  }
  state.run.active = false;
  state.run.stop = false;
  persistNow();
  renderProgress();
}

async function writeReport() {
  const s = state.study;
  if (state.report.busy) return;
  const sheet = buildOutbound(s);
  try {
    checkOutbound(sheet, s); // the last gate before anything is sent
  } catch (error) {
    state.report.problem = error.message;
    return renderSheetBlock();
  }
  const pending = { busy: true, live: '', problem: '' };
  state.report = pending;
  const isCurrent = () => state.study === s && state.report === pending;
  renderSheetBlock();
  renderReport();
  const facts = sheetFacts(sheet);
  const { answers_received, answers_read, answers_with_no_theme, safety_reports, overall_tone, tallies, by_group } = sheet;
  const counts = { answers_received, answers_read, answers_with_no_theme, safety_reports, overall_tone, tallies, by_group };
  try {
    const out = await router.run('report', {
      prompt: reportPrompt(sheet),
      system: REPORT_SYSTEM,
      // Without the cloud, the local model only chooses which true statements
      // lead. It writes no sentences of its own.
      devicePrompt: pickPrompt(sheet, facts),
      deviceSystem: PICK_SYSTEM,
      deviceSchema: pickSchema(facts),
      deviceOnChunk: null,
      onChunk(piece, all) {
        if (!isCurrent()) return;
        pending.live = all;
        renderReport();
      },
      onStreamRetry() {
        if (!isCurrent()) return;
        pending.live = '';
        pending.hint = 'The cloud response ended early. Trying another cloud model.';
        renderReport();
      },
    });
    if (!isCurrent()) return;
    const text = out.source === 'on_device' ? fallbackReport(sheet, parsePicks(out.text, facts)) : out.text.trim();
    s.report = { text, counts, source: out.source, reason: out.fallback?.reason ?? null, at: out.at, shortened: null };
    persistNow();
  } catch (error) {
    if (!isCurrent()) return;
    if (error?.code === 'no-path') {
      // No model at all. The page can still state what the counts say.
      s.report = { text: fallbackReport(sheet), counts, source: 'page', reason: error.detail?.cloud ?? null, at: new Date().toISOString(), shortened: null };
      persistNow();
    } else {
      pending.problem = explain(error);
    }
  }
  pending.busy = false;
  pending.live = '';
  renderSheetBlock();
  renderReport();
}

async function shortenReport() {
  const s = state.study;
  if (!s.report || state.report.busy) return;
  state.report = { busy: true, live: '', problem: '' };
  renderReport();
  try {
    const out = await router.run('shorten', {
      prompt: shortenPrompt(s.report.text),
      onChunk(piece, all) {
        state.report.live = all;
        renderReport();
      },
    });
    s.report = { ...s.report, text: out.text.trim(), shortened: out.source };
    persistNow();
  } catch (error) {
    state.report.problem = explain(error);
  }
  state.report.busy = false;
  state.report.live = '';
  renderSheetBlock();
  renderReport();
}

// ---------- events ----------

function answerById(id) {
  return state.study?.answers.find((a) => a.id === id);
}

function afterLabelChange(answer) {
  answer.reading.edited = true;
  persist();
  updateSlip(answer);
  renderThemes();
  renderSheetBlock();
}

const actions = {
  sample() {
    state.study = sampleStudy();
    persistNow();
    render();
  },
  'add-theme'() {
    state.study.themes.push({ name: '', definition: '' });
    renderFrame();
    app.querySelector('.theme-row:last-child input')?.focus();
  },
  'remove-theme'(target) {
    state.study.themes.splice(Number(target.dataset.index), 1);
    persist();
    renderFrame();
  },
  'suggest-question': () => suggestThemes('question'),
  'suggest-sample': () => suggestThemes('sample'),
  'start-reading': startStudy,
  discard() {
    if (!window.confirm('Remove this study from this browser? The answers and their labels are not stored anywhere else.')) return;
    if (state.run.active) state.run.stop = true;
    clearStudy();
    Object.assign(state, { study: null, filter: 'all', open: new Set(), editing: new Set(), lastCounts: {}, frameProblem: '', intakeProblem: '', suggest: { busy: false, note: '', problem: '' }, report: { busy: false, live: '', problem: '' } });
    render();
  },
  'change-themes'() {
    if (!window.confirm('Changing the themes clears the labels and the report. The answers stay.')) return;
    const s = state.study;
    if (state.run.active) state.run.stop = true;
    s.answers.forEach((a) => {
      a.reading = null;
      a.shareGist = false;
    });
    s.report = null;
    s.started = false;
    state.lastCounts = {};
    state.filter = 'all';
    persistNow();
    render();
  },
  tab(target) {
    showPane(target.dataset.pane);
  },
  filter(target) {
    state.filter = target.dataset.key;
    renderThemes();
    renderAnswers();
    $('#pane-answers').scrollTop = 0;
    // On a narrow screen the answers are a separate part of the page.
    if (NARROW.matches) {
      showPane('answers');
      focusHeading($('#pane-answers'));
    }
  },
  read: beginReading,
  recorded() {
    const s = state.study;
    if (!canShowRecorded(s)) return;
    s.themes = normalizeThemes(s.themes);
    s.started = true;
    recordedReadings().forEach((reading, i) => {
      s.answers[i].reading = reading;
    });
    state.run.problem = '';
    persistNow();
    render();
    focusHeading();
  },
  pause() {
    state.run.stop = true;
    renderProgress();
  },
  original(target) {
    const id = target.dataset.id;
    if (state.open.has(id)) state.open.delete(id);
    else state.open.add(id);
    updateSlip(answerById(id));
  },
  edit(target) {
    const id = target.dataset.id;
    if (state.editing.has(id)) state.editing.delete(id);
    else state.editing.add(id);
    updateSlip(answerById(id));
  },
  'toggle-theme'(target) {
    const answer = answerById(target.dataset.id);
    const id = target.dataset.theme;
    const themes = answer.reading.themes;
    answer.reading.themes = themes.includes(id) ? themes.filter((t) => t !== id) : [...themes, id];
    answer.reading.failed = false;
    afterLabelChange(answer);
  },
  'toggle-flag'(target) {
    const answer = answerById(target.dataset.id);
    answer.reading.flag = !answer.reading.flag;
    afterLabelChange(answer);
  },
  'write-report': writeReport,
  shorten: shortenReport,
  async copy(target) {
    await navigator.clipboard.writeText(state.study.report.text);
    target.textContent = 'Copied';
    setTimeout(() => {
      target.textContent = 'Copy';
    }, 1800);
  },
  print: () => window.print(),
};

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (target && !target.disabled) actions[target.dataset.action]?.(target);
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.dataset.form === 'intake') intake(event.target.elements.paste.value);
});

app.addEventListener('input', (event) => {
  const { input, index } = event.target.dataset;
  const s = state.study;
  if (!input || !s) return;
  if (input === 'theme-name') s.themes[Number(index)].name = event.target.value;
  else if (input === 'theme-definition') s.themes[Number(index)].definition = event.target.value;
  else s[input] = event.target.value;
  if (input === 'title') $('#study-title').textContent = s.title;
  if (input === 'theme-name') renderProgress();
  persist();
});

app.addEventListener('change', async (event) => {
  const kind = event.target.dataset.change;
  if (kind === 'file') {
    const file = event.target.files?.[0];
    if (file) intake(await file.text(), file.name.replace(/\.[^.]+$/, ''));
  } else if (kind === 'confidential') {
    state.study.confidential = event.target.checked;
    $('#confidential-hint').textContent = confidentialHint(event.target.checked);
    persist();
  } else if (kind === 'share') {
    const answer = answerById(event.target.dataset.id);
    answer.shareGist = event.target.checked && gistAllowed(answer.reading.gist, answer.text, state.study.themes.map((t) => t.name)).ok;
    persist();
    updateSlip(answer);
    renderSheetBlock();
  }
});

for (const type of ['online', 'offline']) {
  window.addEventListener(type, () => {
    state.online = navigator.onLine;
    renderBar();
    renderSheetBlock();
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !state.run.active) refreshDevice();
});
window.addEventListener('pagehide', persistNow);

let shownView = null;

/** Moves focus to the first heading that is actually on screen. */
function focusHeading(root = app) {
  [...root.querySelectorAll('h1, h2')].find((heading) => heading.offsetParent !== null)?.focus({ preventScroll: true });
}

function render() {
  renderBar();
  const view = !state.study ? 'start' : state.study.started ? 'work' : 'frame';
  if (view === 'start') renderStart();
  else if (view === 'frame') renderFrame();
  else renderWork();
  if (shownView !== view) {
    window.scrollTo(0, 0);
    // After a change of screen, start keyboard and screen-reader users at its heading.
    if (shownView) focusHeading();
  }
  shownView = view;
}

render();
refreshDevice();
