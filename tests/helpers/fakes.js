// Test doubles. fakeSdk() mirrors how @firebase/ai 3.1.0 dispatches a hybrid
// request (callCloudOrDevice in the SDK bundle): which path each mode tries
// first and which error codes make PREFER_IN_CLOUD fall back to the device.
import { InferenceMode } from 'firebase/ai';

export function aiError(code, status) {
  const error = new Error(`${code}${status ? ` ${status}` : ''}`);
  error.code = code;
  if (status) error.customErrorData = { status };
  return error;
}

const FALLBACK_CODES = ['fetch-error', 'error', 'api-not-enabled'];

export function fakeSdk({ device = 'available', cloud = () => 'cloud text', deviceText = () => 'device text' } = {}) {
  const calls = { cloud: 0, device: 0, aborted: 0, params: [], requests: [], options: [] };
  const state = { device };
  const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
  // Like Chrome's session.prompt(), the fake device stops when the signal it was given aborts.
  const runDevice = async (request, params) => {
    calls.device += 1;
    calls.requests.push({ path: 'device', request, mode: params.mode });
    const signal = params.onDeviceParams?.promptOptions?.signal;
    if (signal?.aborted) throw abortError();
    const work = Promise.resolve().then(() => deviceText(request, params));
    if (!signal) return { text: await work, source: 'on_device' };
    const stopped = new Promise((_, reject) => {
      signal.addEventListener('abort', () => { calls.aborted += 1; reject(abortError()); }, { once: true });
    });
    return { text: await Promise.race([work, stopped]), source: 'on_device' };
  };
  const runCloud = async (request, params) => {
    calls.cloud += 1;
    calls.requests.push({ path: 'cloud', request, mode: params.mode });
    return { text: await cloud(request, params, calls.cloud), source: 'in_cloud' };
  };
  async function dispatch(request, params) {
    const ready = state.device === 'available';
    switch (params.mode) {
      case InferenceMode.ONLY_ON_DEVICE:
        if (!ready) throw aiError('unsupported');
        return runDevice(request, params);
      case InferenceMode.ONLY_IN_CLOUD:
        return runCloud(request, params);
      case InferenceMode.PREFER_ON_DEVICE:
        return ready ? runDevice(request, params) : runCloud(request, params);
      case InferenceMode.PREFER_IN_CLOUD:
        try {
          return await runCloud(request, params);
        } catch (error) {
          if (FALLBACK_CODES.includes(error.code) && ready) return runDevice(request, params);
          throw error;
        }
      default:
        throw new Error(`unexpected mode ${params.mode}`);
    }
  }
  function getModel(params) {
    calls.params.push(params);
    return {
      async generateContent(request, options) {
        calls.options.push(options);
        const out = await dispatch(request, params);
        return { response: { text: () => out.text, inferenceSource: out.source } };
      },
      async generateContentStream(request, options) {
        calls.options.push(options);
        const out = await dispatch(request, params);
        const pieces = out.text.match(/[\s\S]{1,6}/g) ?? [''];
        return {
          stream: (async function* chunks() {
            for (const piece of pieces) yield { text: () => piece };
          })(),
          response: Promise.resolve({ text: () => out.text, inferenceSource: out.source }),
        };
      },
      async initializeDeviceModel(onProgress) {
        onProgress?.(0.5);
        onProgress?.(1);
        state.device = 'available';
      },
    };
  }
  return { getModel, calls, state };
}

export function fakeEnv({ device = 'available', online = true, configured = true } = {}) {
  const env = {
    device,
    isOnline: online,
    configured,
    deviceAvailability: async () => env.device,
    online: () => env.isOnline,
    cloudConfigured: () => env.configured,
  };
  return env;
}

export const MODELS = { light: 'light-model', writing: 'writing-model' };

export function makeStudy(overrides = {}) {
  return {
    version: 1,
    title: 'Test study',
    question: 'What should we change next year?',
    context: 'Post-event survey for a developer conference.',
    confidential: true,
    themes: [
      { id: 'VENUE', name: 'Venue', definition: 'Rooms, seating, Wi-Fi.' },
      { id: 'FOOD', name: 'Food', definition: 'Catering and coffee.' },
    ],
    answers: [
      { id: 'a1', text: 'The Wi-Fi dropped every time the main hall filled up.', group: 'First-time', reading: null, shareGist: false },
      { id: 'a2', text: 'No vegan option at lunch on day two.', group: 'Returning', reading: null, shareGist: false },
      { id: 'a3', text: 'Rooms were freezing and the chairs hurt after an hour.', group: 'First-time', reading: null, shareGist: false },
    ],
    report: null,
    ...overrides,
  };
}

export const reading = (themes, sentiment = 'negative', extra = {}) => ({ themes, sentiment, flag: false, gist: '', source: 'on_device', ms: 1, edited: false, ...extra });
