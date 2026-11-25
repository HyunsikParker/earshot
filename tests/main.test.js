import { afterEach, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from '../node_modules/@firebase/ai/dist/esm/index.esm.js';
import { getSdk } from '../src/ai/firebase.js';
import { sampleStudy } from '../src/sample/conference.js';
import { loadStudy, saveStudy } from '../src/store.js';
import { aiError, fakeSdk } from './helpers/fakes.js';
import CLOUD_REPORT from './fixtures/cloud-report-2026-11-25.json';

vi.mock('../src/ai/firebase.js', () => ({ getSdk: vi.fn() }));

const action = (name) => document.querySelector(`[data-action="${name}"]`);

async function boot({ study, device = 'available', sdk = fakeSdk({ device }) } = {}) {
  vi.resetModules();
  localStorage.clear();
  if (study) saveStudy(study);
  document.body.innerHTML = '<header><div id="brand"></div><p id="study-title"></p><div id="status"></div></header><main id="app"></main>';
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => device) });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(getSdk).mockReturnValue(sdk);
  await import('../src/main.js');
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).not.toContain('Checking'));
  return sdk;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['downloadable', 'downloading', 'available', 'unavailable', 'unsupported'])(
  'offers the recording straight from the sample setup when the model is %s',
  async (device) => {
    const sdk = await boot({ device });
    action('sample').click();
    expect(document.querySelector('#frame-recorded').textContent).toMatch(/no download.*pause.*15 minutes/s);
    action('recorded').click();
    expect(document.querySelector('#progress').textContent).toContain('Nothing was read in this browser.');
    expect(action('recorded')).toBeNull();
    expect(action('write-report').disabled).toBe(false);
    expect(loadStudy().answers.every((answer) => answer.reading?.source === 'recorded')).toBe(true);
    expect(sdk.calls.params).toEqual([]);
  },
);

it.each(['downloadable', 'downloading'])('offers the recording when resuming an unread sample with the model %s', async (device) => {
  await boot({ device, study: { ...sampleStudy(), started: true } });
  expect(document.querySelector('#progress [data-action="recorded"]')).not.toBeNull();
  expect(document.querySelector('#progress-narrow [data-action="recorded"]')).not.toBeNull();
});

it('keeps the recording out of the way during a run and after pausing with a counted answer', async () => {
  const firstAnswer = Promise.withResolvers();
  const sdk = await boot({ sdk: fakeSdk({ deviceText: () => firstAnswer.promise }) });
  action('sample').click();
  action('start-reading').click();
  expect(action('recorded')).toBeNull();
  await vi.waitFor(() => expect(sdk.calls.device).toBe(1));
  action('pause').click();
  firstAnswer.resolve('{"themes":["VENUE"],"sentiment":"negative","safety_report":false,"gist":"Connectivity was poor."}');
  await vi.waitFor(() => expect(action('read').textContent).toBe('Continue reading'));
  expect(action('recorded')).toBeNull();
  expect(document.querySelector('#sheet-block').textContent).toContain('1 of 64 answers counted');
  expect(action('write-report').disabled).toBe(false);
});

it('does not offer the recording for a changed sample theme or an imported study', async () => {
  await boot({ study: { ...sampleStudy(), sample: false } });
  expect(action('recorded')).toBeNull();

  await boot({ study: sampleStudy() });
  expect(action('recorded')).not.toBeNull();
  const theme = document.querySelector('[data-input="theme-name"]');
  theme.value = 'Another theme';
  theme.dispatchEvent(new Event('input', { bubbles: true }));
  expect(action('recorded')).toBeNull();
});

const GOOD_REPORT = '## What people talked about most\n- **64** answers were read.';
const BAD_REPORT = '## What people talked about most\n- Venue had **999** answers.';

it.each([
  [GOOD_REPORT, 'Every number matched the report tally.', '64 answers were read.'],
  [BAD_REPORT, '“Venue had 999 answers.” is not supported', 'Venue had 999 answers.'],
])('checks a finished cloud report and preserves its text: %s', async (report, checkText, bodyText) => {
  const sdk = await boot({ sdk: fakeSdk({ cloud: () => report }) });
  action('sample').click();
  action('recorded').click();
  action('write-report').click();
  await vi.waitFor(() => expect(document.querySelector('.report__check')?.textContent).toContain(checkText));
  expect(document.querySelector('.report__body').textContent).toContain(bodyText);
  expect(document.querySelector('.report__source').textContent).toContain('Written in the cloud');
  expect(loadStudy().report).toMatchObject({ text: report, counts: { answers_read: 64 } });
  expect(sdk.calls.cloud).toBe(1);
});

it('replaces an interrupted HTTP 200 stream with the full report from the alternate model', async () => {
  const { promise, resolve } = Promise.withResolvers();
  // Sanitized capture: a normal CRLF-delimited SSE frame, then a bare JSON
  // error instead of another SSE frame or a candidate with finishReason STOP.
  const partial = { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Respondents focused on several' }] } }] };
  const overload = { error: { code: 500, message: 'This model is currently experiencing high demand.', status: 'INTERNAL' } };
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('data: ' + JSON.stringify(partial) + '\r\n\r\n' + JSON.stringify(overload, null, 2) + '\n', {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    }))
    .mockReturnValueOnce(promise);
  vi.stubGlobal('fetch', fetch);
  const app = initializeApp({ apiKey: 'test-only', projectId: 'test-only', appId: 'test-only' }, 'report-overload');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const completed = new Response(JSON.stringify({
    candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: BAD_REPORT }] } }],
  }), { headers: { 'content-type': 'application/json' } });
  try {
    await boot({ device: 'unavailable', sdk: { getModel: (params) => getGenerativeModel(ai, params) } });
    action('sample').click();
    action('recorded').click();
    action('write-report').click();
    await vi.waitFor(() => expect(document.querySelector('.report__body').textContent).toContain('Trying another cloud model'));
    expect(document.querySelector('.report__body').textContent).not.toContain('Respondents focused');
    expect(loadStudy().report).toBeNull();
    resolve(completed);

    await vi.waitFor(() => expect(document.querySelector('.report__source')?.textContent).toContain('Written in the cloud'), { timeout: 2500 });
    expect(document.querySelector('.report__check').textContent).toContain('“Venue had 999 answers.” is not supported');
    expect(document.querySelector('.report__body').textContent).toContain('Venue had 999 answers.');
    expect(loadStudy().report).toMatchObject({ source: 'in_cloud', text: BAD_REPORT, counts: { answers_read: 64 } });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [[firstUrl, firstRequest], [retryUrl, retryRequest]] = fetch.mock.calls;
    expect(firstUrl).toContain('/gemini-3.5-flash-lite:streamGenerateContent');
    expect(retryUrl).toContain('/gemini-4-hydrogen:generateContent');
    expect(retryRequest.body).toBe(firstRequest.body);
  } finally {
    resolve(completed);
    await deleteApp(app);
  }
});

it.each([
  ['available', 'on_device', 'on this computer'],
  ['unavailable', 'page', 'did not finish'],
])('checks the fallback when the cloud refuses and the local model is %s', async (device, source, outcome) => {
  const sdk = fakeSdk({ device, cloud: () => { throw aiError('fetch-error', 403); }, deviceText: () => '{"picks":["2"]}' });
  await boot({ device, sdk });
  action('sample').click();
  action('recorded').click();
  action('write-report').click();
  await vi.waitFor(() => expect(document.querySelector('.report__check')?.textContent).toContain('Every number matched the report tally.'));
  expect(loadStudy().report.source).toBe(source);
  expect(document.querySelector('#audit').textContent).toContain(`Write the report: ${outcome}, because the cloud refused the request`);
});

it('checks restored reports against their original counts, falling back to the current tally for old saves', async () => {
  const study = { ...sampleStudy(), started: true, report: { text: 'Venue: 23 answers.', source: 'in_cloud' } };
  await boot({ study });
  expect(document.querySelector('.report__check').textContent).toContain('“Venue: 23 answers.” is not supported by the current tally');

  study.report.counts = {
    answers_received: 64, answers_read: 23, answers_with_no_theme: 0, safety_reports: 0,
    overall_tone: { positive: 0, negative: 23, mixed: 0, neutral: 0 },
    tallies: [{ theme: 'Venue', answers: 23, positive: 0, negative: 23, mixed: 0, neutral: 0 }],
  };
  await boot({ study });
  expect(document.querySelector('.report__check').textContent).toContain('Every number matched the report tally.');
});

it('quotes a long flagged statement only up to a word boundary', async () => {
  const study = { ...sampleStudy(), started: true, report: { text: CLOUD_REPORT.report, source: 'in_cloud', counts: CLOUD_REPORT.sheet } };
  await boot({ study });
  expect(document.querySelector('.report__check').textContent).toBe(
    'Count check: “Out of 64 answers received and 64 read, what specific adjustments should be prioritized for the next two-day developer…” is not supported by the report tally.',
  );
});
