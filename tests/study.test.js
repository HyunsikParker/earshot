import { describe, expect, it, vi } from 'vitest';
import { parseCsv, parseInput, looksLikeTable, toAnswers, MAX_ANSWER_CHARS } from '../src/study/parse.js';
import { normalizeThemes, parseThemeList, themeId, sampleAnswers, MAX_THEMES } from '../src/study/codebook.js';
import { normalizeReading, readAll, readSchema, readSystem } from '../src/study/reader.js';
import { tally, SMALL_CELL } from '../src/study/aggregate.js';
import { buildOutbound, checkOutbound, outboundText, approvedGists } from '../src/study/outbound.js';
import { assertNoVerbatim, findIdentifiers, gistAllowed, OutboundBlocked, sharedRun } from '../src/study/guard.js';
import { reportPrompt } from '../src/study/report.js';
import { createRouter } from '../src/ai/router.js';
import { newStudy, loadStudy, saveStudy, clearStudy } from '../src/store.js';
import { fakeEnv, fakeSdk, makeStudy, MODELS, reading } from './helpers/fakes.js';

describe('bringing answers in', () => {
  it('reads one answer per line and drops blanks', () => {
    const { kind, answers } = parseInput('First answer.\n\n  Second answer.  \n');
    expect(kind).toBe('lines');
    expect(answers.map((a) => a.text)).toEqual(['First answer.', 'Second answer.']);
    expect(answers[0]).toMatchObject({ id: 'a1', reading: null, shareGist: false, group: '' });
  });

  it('parses quoted fields, embedded commas, quotes and line breaks', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"two\nlines",z\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', 'z']]);
  });

  it('finds the answer column and a group column in a table', () => {
    const csv = 'Role,Comment\nFirst-time,"The Wi-Fi dropped, a lot."\nReturning,Coffee ran out by ten.\nFirst-time,Rooms were cold.\nReturning,Loved the keynote.\nFirst-time,Too many overlaps.';
    expect(looksLikeTable(csv)).toBe(true);
    const parsed = parseInput(csv);
    expect(parsed).toMatchObject({ kind: 'table', answerColumn: 'Comment', groupColumn: 'Role' });
    expect(parsed.answers[0]).toMatchObject({ text: 'The Wi-Fi dropped, a lot.', group: 'First-time' });
    expect(parsed.answers).toHaveLength(5);
  });

  it('handles semicolon tables and does not mistake prose with commas for a table', () => {
    expect(parseInput('Team;Answer\nA;Good\nB;Bad\nA;Fine').kind).toBe('table');
    expect(parseInput('Honestly, it was fine, mostly.\nLunch, though, was late.').kind).toBe('lines');
  });

  it('caps very long answers', () => {
    expect(toAnswers(['x'.repeat(5000)])[0].text).toHaveLength(MAX_ANSWER_CHARS);
  });
});

describe('themes', () => {
  it('makes stable ids and keeps names unique', () => {
    expect(themeId('Food & drink')).toBe('FOOD_DRINK');
    const themes = normalizeThemes([{ name: 'Venue', definition: ' Rooms ' }, { name: 'venue' }, { name: '  ' }]);
    expect(themes.map((t) => t.id)).toEqual(['VENUE', 'VENUE_2']);
    expect(themes[0].definition).toBe('Rooms');
  });

  it('limits the list and survives bad model output', () => {
    expect(normalizeThemes(Array.from({ length: 30 }, (_, i) => ({ name: `T${i}` })))).toHaveLength(MAX_THEMES);
    expect(parseThemeList('not json')).toEqual([]);
    expect(parseThemeList('{"themes":[{"name":"Schedule","definition":"Timing."}]}')).toEqual([{ id: 'SCHEDULE', name: 'Schedule', definition: 'Timing.' }]);
  });

  it('samples evenly and deterministically', () => {
    const answers = Array.from({ length: 40 }, (_, i) => ({ text: `answer ${i}` }));
    expect(sampleAnswers(answers, 4)).toEqual(['answer 0', 'answer 10', 'answer 20', 'answer 30']);
  });
});

describe('reading', () => {
  const study = makeStudy();

  it('builds a schema limited to the study themes', () => {
    expect(readSchema(study.themes).properties.themes.items.enum).toEqual(['VENUE', 'FOOD']);
    expect(readSystem(study)).toContain('- VENUE: Rooms, seating, Wi-Fi.');
  });

  it('accepts a valid reading and drops themes it does not know', () => {
    const text = '```json\n{"themes":["VENUE","PARKING","VENUE"],"sentiment":"negative","safety_report":true,"gist":" Wi-Fi  was unreliable. "}\n```';
    expect(normalizeReading(text, study.themes)).toEqual({ themes: ['VENUE'], sentiment: 'negative', flag: true, gist: 'Wi-Fi was unreliable.' });
  });

  it('rejects output that is not a reading', () => {
    expect(normalizeReading('sorry', study.themes)).toBeNull();
    expect(normalizeReading('{"themes":[],"sentiment":"angry"}', study.themes)).toBeNull();
  });

  function routerWith(deviceText, env = {}) {
    const sdk = fakeSdk({ deviceText });
    const e = fakeEnv(env);
    sdk.state.device = e.device;
    return { sdk, router: createRouter({ sdk, env: e, cloudModels: MODELS }) };
  }
  const good = '{"themes":["FOOD"],"sentiment":"negative","safety_report":false,"gist":"Food ran short."}';

  it('reads every answer on the device, retries bad output once, and never calls the cloud', async () => {
    let n = 0;
    const { sdk, router } = routerWith(() => { n += 1; return n === 2 ? 'garbage' : good; });
    const s = makeStudy();
    const seen = [];
    const result = await readAll({ study: s, router, onReading: (a) => seen.push(a.id) });
    expect(result).toEqual({ stopped: false, done: 3 });
    expect(seen).toEqual(['a1', 'a2', 'a3']);
    expect(s.answers.every((a) => a.reading.source === 'on_device' && !a.reading.failed)).toBe(true);
    expect(sdk.calls.device).toBe(4);
    expect(sdk.calls.cloud).toBe(0);
  });

  it('marks an answer for hand labelling after two unusable outputs', async () => {
    const { router } = routerWith(() => 'garbage');
    const s = makeStudy({ answers: [makeStudy().answers[0]] });
    await readAll({ study: s, router });
    expect(s.answers[0].reading).toMatchObject({ failed: true, themes: [] });
  });

  it('skips answers that already have a reading and stops when asked', async () => {
    const { sdk, router } = routerWith(() => good);
    const s = makeStudy();
    s.answers[0].reading = reading(['VENUE']);
    let calls = 0;
    const result = await readAll({ study: s, router, shouldStop: () => (calls += 1) > 1 });
    expect(result).toEqual({ stopped: true, done: 1 });
    expect(sdk.calls.device).toBe(1);
    expect(s.answers[2].reading).toBeNull();
  });

  it('limits what the model may produce, so it cannot run on', () => {
    const schema = readSchema(study.themes);
    expect(schema.properties.themes.maxItems).toBe(2);
    expect(schema.properties.gist.maxLength).toBe(200);
  });

  it('marks an answer the model cannot finish and carries on with the next', async () => {
    let n = 0;
    const { sdk, router } = routerWith(() => { n += 1; if (n <= 2) throw new Error('The response exceeded output limits and was truncated.'); return good; });
    const s = makeStudy();
    expect(await readAll({ study: s, router })).toEqual({ stopped: false, done: 3 });
    expect(s.answers.map((a) => Boolean(a.reading.failed))).toEqual([true, false, false]);
    expect(sdk.calls.device).toBe(4);
    expect(sdk.calls.cloud).toBe(0);
  });

  it('retries an answer once after a model failure', async () => {
    let n = 0;
    const { router } = routerWith(() => { n += 1; if (n === 1) throw new Error('hiccup'); return good; });
    const s = makeStudy();
    await readAll({ study: s, router });
    expect(s.answers.every((a) => !a.reading.failed)).toBe(true);
  });

  it('does not try an answer again after a timeout, and stops after two timeouts in a row', async () => {
    const sdk = fakeSdk({ deviceText: () => new Promise(() => {}) });
    const router = createRouter({ sdk, env: fakeEnv(), cloudModels: MODELS, deviceTimeoutMs: 15 });
    const s = makeStudy();
    await expect(readAll({ study: s, router })).rejects.toMatchObject({ code: 'device-timeout' });
    expect(sdk.calls.device).toBe(2);
    expect(sdk.calls.aborted).toBe(2);
    expect(s.answers.map((a) => a.reading)).toEqual([null, null, null]);
  });

  it('carries on after a single timeout, on a new model', async () => {
    let n = 0;
    const sdk = fakeSdk({ deviceText: () => { n += 1; return n === 1 ? new Promise(() => {}) : good; } });
    const router = createRouter({ sdk, env: fakeEnv(), cloudModels: MODELS, deviceTimeoutMs: 15 });
    const s = makeStudy();
    expect(await readAll({ study: s, router })).toEqual({ stopped: false, done: 3 });
    expect(s.answers.map((a) => Boolean(a.reading.failed))).toEqual([true, false, false]);
    expect(sdk.calls.params).toHaveLength(2);
    expect(sdk.calls.cloud).toBe(0);
  });

  it('gives up when three answers in a row cannot be read', async () => {
    const { router } = routerWith(() => { throw new Error('model gone'); });
    const s = makeStudy();
    await expect(readAll({ study: s, router })).rejects.toMatchObject({ code: 'device-error' });
    expect(s.answers.map((a) => a.reading)).toEqual([null, null, null]);
  });

  it('stops with an error, without uploading, when the local model is missing', async () => {
    const { sdk, router } = routerWith(() => good, { device: 'unsupported' });
    await expect(readAll({ study: makeStudy(), router })).rejects.toMatchObject({ code: 'device-unavailable' });
    expect(sdk.calls.cloud).toBe(0);
  });
});

describe('what leaves the computer', () => {
  function readStudy() {
    const s = makeStudy();
    s.answers[0].reading = reading(['VENUE'], 'negative', { gist: 'Connectivity failed when the hall was busy.' });
    s.answers[1].reading = reading(['FOOD'], 'negative', { gist: 'No vegan option at lunch on day two.' });
    s.answers[2].reading = reading(['VENUE'], 'mixed', { flag: true, gist: 'Reach me at dana.k@example.com about the rooms.' });
    return s;
  }

  it('counts themes, tone and safety reports', () => {
    const t = tally(readStudy());
    expect(t).toMatchObject({ answers: 3, read: 3, noTheme: 0, safetyReports: 1, tone: { negative: 2, mixed: 1, positive: 0, neutral: 0 } });
    expect(t.themes).toEqual([
      { id: 'VENUE', name: 'Venue', count: 2, positive: 0, negative: 1, mixed: 1, neutral: 0 },
      { id: 'FOOD', name: 'Food', count: 1, positive: 0, negative: 1, mixed: 0, neutral: 0 },
    ]);
  });

  it('ignores unread and failed answers and counts answers with no theme', () => {
    const s = readStudy();
    s.answers[0].reading = null;
    s.answers[1].reading = { failed: true, themes: [], sentiment: 'neutral', flag: false, gist: '' };
    s.answers[2].reading = reading([], 'positive');
    expect(tally(s)).toMatchObject({ read: 1, noTheme: 1 });
  });

  it('withholds small cells and merges small groups in the per-group table', () => {
    const answers = [];
    const add = (group, themes, n) => { for (let i = 0; i < n; i += 1) answers.push({ id: `g${answers.length}`, text: `t ${answers.length}`, group, reading: reading(themes), shareGist: false }); };
    add('First-time', ['VENUE'], 4);
    add('First-time', ['FOOD'], 1);
    add('Returning', ['FOOD'], 3);
    add('Speaker', ['VENUE'], 2);
    const groups = tally(makeStudy({ answers })).groups;
    expect(groups).toEqual([
      { group: 'First-time', answers: 5, themes: { Venue: 4, Food: `fewer than ${SMALL_CELL}` } },
      { group: 'Returning', answers: 3, themes: { Venue: 0, Food: 3 } },
    ]);
  });

  it('builds a sheet with counts and analyst wording only', () => {
    const s = readStudy();
    const sheet = buildOutbound(s);
    expect(sheet).toMatchObject({ answers_received: 3, answers_read: 3, safety_reports: 1, tallies: [{ theme: 'Venue', answers: 2 }, { theme: 'Food', answers: 1 }] });
    expect(sheet.approved_gists).toBeUndefined();
    const text = outboundText(sheet);
    for (const a of s.answers) expect(text).not.toContain(a.text);
    expect(checkOutbound(sheet, s).bytes).toBeGreaterThan(100);
    expect(reportPrompt(sheet)).toContain(text);
    expect(reportPrompt(sheet)).toContain('## Safety reports');
  });

  it('includes only gists the analyst approved and the guard allows', () => {
    const s = readStudy();
    s.answers.forEach((a) => { a.shareGist = true; });
    expect(approvedGists(s)).toEqual(['Connectivity failed when the hall was busy.']);
    expect(gistAllowed(s.answers[1].reading.gist, s.answers[1].text)).toMatchObject({ ok: false });
    expect(gistAllowed(s.answers[2].reading.gist, s.answers[2].text).reason).toContain('email');
    expect(buildOutbound(s).approved_gists).toHaveLength(1);
  });

  it('blocks a sheet that carries four consecutive words of any answer', () => {
    const s = readStudy();
    const sheet = buildOutbound(s);
    sheet.approved_gists = ['Someone said the chairs hurt after an hour of sitting.'];
    expect(() => checkOutbound(sheet, s)).toThrow(OutboundBlocked);
    try { checkOutbound(sheet, s); } catch (e) { expect(e).toMatchObject({ answerId: 'a3', run: 'the chairs hurt after' }); }
  });

  it('does not block wording the analyst wrote, even when an answer repeats it', () => {
    const s = readStudy();
    s.answers.push({ id: 'a4', text: 'What should we change next year? Honestly nothing.', group: '', reading: reading([], 'positive'), shareGist: false });
    expect(() => checkOutbound(buildOutbound(s), s)).not.toThrow();
    expect(() => assertNoVerbatim({ note: 'what should we change next year' }, s.answers, [])).toThrow(OutboundBlocked);
  });

  it('spots identifiers and shared wording', () => {
    expect(findIdentifiers('mail dana.k@example.com or +1 (415) 555-0132, see www.example.org, @dana_k, id 20264471').map((f) => f.kind)).toEqual(['an email address', 'a link', 'a phone number', 'a user handle', 'a long number']);
    expect(findIdentifiers('Rooms were cold on day 2.')).toEqual([]);
    expect(sharedRun('The WI-FI dropped every time, again', 'the wi-fi dropped every time the hall filled')).toBe('the wi fi dropped');
    expect(sharedRun('Connectivity was unreliable.', 'The Wi-Fi dropped every time.')).toBeNull();
  });
});

describe('saving the study in the browser', () => {
  function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  }

  it('round-trips a study and clears it', () => {
    const storage = memoryStorage();
    const study = newStudy({ title: 'T', answers: toAnswers(['one']) });
    expect(saveStudy(study, storage)).toBe(true);
    expect(loadStudy(storage)).toEqual(study);
    clearStudy(storage);
    expect(loadStudy(storage)).toBeNull();
  });

  it('reports a failed save and ignores corrupt data', () => {
    expect(saveStudy(newStudy(), { setItem: () => { throw new Error('full'); } })).toBe(false);
    expect(loadStudy({ getItem: () => '{broken' })).toBeNull();
    expect(loadStudy({ getItem: () => '{"version":2}' })).toBeNull();
  });
});
