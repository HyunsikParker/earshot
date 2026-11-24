import { afterEach, expect, it, vi } from 'vitest';
import { getSdk } from '../src/ai/firebase.js';
import { sampleStudy } from '../src/sample/conference.js';
import { loadStudy, saveStudy } from '../src/store.js';
import { fakeSdk } from './helpers/fakes.js';

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
