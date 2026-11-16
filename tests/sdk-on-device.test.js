// @vitest-environment jsdom
// The real Firebase AI Logic SDK (browser build) against a stand-in for
// Chrome's LanguageModel. Proves that the confidential route is answered by
// the local model and that no network request is made on the way.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import * as browserAi from '../node_modules/@firebase/ai/dist/esm/index.esm.js';
import { createRouter } from '../src/ai/router.js';
import { readSchema, readSystem, answerPrompt, normalizeReading } from '../src/study/reader.js';
import { makeStudy, MODELS } from './helpers/fakes.js';

const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = browserAi;
const REPLY = '{"themes":["VENUE"],"sentiment":"negative","safety_report":false,"gist":"Connectivity was unreliable."}';

let app;
let fetchSpy;
let sessions;

beforeEach(() => {
  sessions = [];
  window.LanguageModel = {
    availability: vi.fn(async () => 'available'),
    create: vi.fn(async (options) => {
      const session = { options, prompt: vi.fn(async () => REPLY), destroy: vi.fn() };
      sessions.push(session);
      return session;
    }),
  };
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('A network request was made.');
  });
  app = initializeApp({ apiKey: 'local-only', projectId: 'local-only', appId: 'local-only' }, `test-${Math.random()}`);
});

afterEach(async () => {
  fetchSpy.mockRestore();
  delete window.LanguageModel;
  await deleteApp(app);
});

function routerFor(availability = async () => 'available', deviceTimeoutMs = 45000) {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return createRouter({
    sdk: { getModel: (params) => getGenerativeModel(ai, params) },
    env: { deviceAvailability: availability, online: () => true, cloudConfigured: () => false },
    cloudModels: MODELS,
    deviceTimeoutMs,
  });
}

it('uses the same mode values as the SDK', () => {
  expect(InferenceMode).toEqual({ PREFER_ON_DEVICE: 'prefer_on_device', ONLY_ON_DEVICE: 'only_on_device', ONLY_IN_CLOUD: 'only_in_cloud', PREFER_IN_CLOUD: 'prefer_in_cloud' });
});

it('reads a confidential answer on the device through the SDK without touching the network', async () => {
  const study = makeStudy();
  const schema = readSchema(study.themes);
  const out = await routerFor().run('read', { prompt: answerPrompt(study.answers[0].text), system: readSystem(study), schema, confidential: true });

  expect(out.source).toBe('on_device');
  expect(out.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
  expect(normalizeReading(out.text, study.themes)).toMatchObject({ themes: ['VENUE'], sentiment: 'negative' });
  expect(fetchSpy).not.toHaveBeenCalled();

  expect(sessions).toHaveLength(1);
  const { options, prompt } = sessions[0];
  expect(options.expectedInputs).toEqual([{ type: 'text', languages: ['en'] }]);
  expect(options.initialPrompts[0].content[0].value).toContain('You label survey comments');
  const [messages, promptOptions] = prompt.mock.calls[0];
  expect(messages[0].content[0]).toEqual({ type: 'text', value: answerPrompt(study.answers[0].text) });
  expect(promptOptions.responseConstraint).toEqual(schema);
});

it('throws inside the SDK, still without a network request, when the browser reports no local model', async () => {
  window.LanguageModel.availability = vi.fn(async () => 'unavailable');
  // The router is told the model is ready so the request reaches the SDK,
  // which must refuse on its own.
  await expect(routerFor().run('read', { prompt: 'Comment: "x"', confidential: true })).rejects.toMatchObject({ code: 'device-error' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('aborts a generation that outlasts the limit through the signal the SDK passes on, then answers on a new session', async () => {
  // A stand-in session that, like Chrome's, never answers until its signal aborts.
  let hang = true;
  window.LanguageModel.create = vi.fn(async (options) => {
    const session = {
      options,
      destroy: vi.fn(),
      prompt: vi.fn((messages, promptOptions) =>
        hang
          ? new Promise((_, reject) => promptOptions.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
          : Promise.resolve(REPLY),
      ),
    };
    sessions.push(session);
    return session;
  });
  const router = routerFor(undefined, 40);

  await expect(router.run('read', { prompt: 'Comment: "x"', confidential: true })).rejects.toMatchObject({ code: 'device-timeout' });
  const firstSignal = sessions[0].prompt.mock.calls[0][1].signal;
  expect(firstSignal).toBeInstanceOf(AbortSignal);
  expect(firstSignal.aborted).toBe(true);
  expect(sessions[0].options.signal).toBe(firstSignal);

  hang = false;
  const out = await router.run('read', { prompt: 'Comment: "x"', confidential: true });
  expect(out.source).toBe('on_device');
  expect(sessions).toHaveLength(2);
  expect(sessions[1].prompt.mock.calls[0][1].signal.aborted).toBe(false);
  expect(fetchSpy).not.toHaveBeenCalled();
});
