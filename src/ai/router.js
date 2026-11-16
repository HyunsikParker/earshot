// Chooses where each step runs, runs it through Firebase AI Logic, and writes
// down what happened. The policy lives in routes.js; this file enforces it.
import { InferenceMode } from 'firebase/ai';
import { ROUTES, modeFor } from './routes.js';
import { TEXT_EN, deviceReady, deviceCanBecomeReady } from './device.js';

export class RouteError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'RouteError';
    this.code = code;
    this.detail = detail;
  }
}

/** Why the cloud did not answer. `online` is the browser's view at the time of failure. */
export function classifyCloudError(error, online = true) {
  if (!online) return 'offline';
  const status = error?.customErrorData?.status;
  if (error?.code === 'fetch-error') {
    if (status === 429) return 'quota';
    if (status === 401 || status === 403) return 'blocked';
    if (status >= 500) return 'unavailable';
    return 'cloud-error';
  }
  if (error?.code === 'api-not-enabled') return 'blocked';
  if (error?.code === 'error') return 'network';
  return 'cloud-error';
}

const isRetryable = (error) => error?.code === 'fetch-error' && [429, 503].includes(error?.customErrorData?.status);

export function buildModelParams(mode, { cloudModel, system, schema }, signal) {
  const createOptions = { expectedInputs: [...TEXT_EN], expectedOutputs: [...TEXT_EN] };
  if (system) createOptions.initialPrompts = [{ role: 'system', content: [{ type: 'text', value: system }] }];
  const promptOptions = {};
  // One schema drives both paths: responseConstraint on the device,
  // responseSchema in the cloud.
  if (schema) promptOptions.responseConstraint = schema;
  // The SDK hands these two objects to Chrome's create() and prompt() as they
  // are, and both accept an AbortSignal. That is the only way to stop an
  // on-device generation through the SDK: its per-request `signal` option
  // cancels the cloud HTTP request only.
  if (signal) {
    createOptions.signal = signal;
    promptOptions.signal = signal;
  }
  const onDeviceParams = { createOptions };
  if (schema || signal) onDeviceParams.promptOptions = promptOptions;
  const inCloudParams = { model: cloudModel };
  if (system) inCloudParams.systemInstruction = system;
  if (schema) inCloudParams.generationConfig = { responseMimeType: 'application/json', responseSchema: schema };
  return { mode, inCloudParams, onDeviceParams };
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deviceFailure = (error) => (error?.code === 'timeout' ? 'device-timeout' : 'device-error');

/**
 * @param {object} deps
 * @param {{getModel: Function}} deps.sdk  from ai/firebase.js
 * @param {{deviceAvailability: () => Promise<string>, online: () => boolean, cloudConfigured: () => boolean}} deps.env
 * @param {{light: string, writing: string}} deps.cloudModels
 * @param {(entry: object) => void} [deps.log]  receives one entry per finished or failed step
 */
export function createRouter({ sdk, env, cloudModels, log = () => {}, sleep = defaultSleep, now = () => Date.now(), retryDelays = [800, 2400], deviceTimeoutMs = 45000 }) {
  const models = new Map();
  let deviceQueue = Promise.resolve();

  // One model per configuration, with the AbortController whose signal it was built with.
  function modelFor(mode, spec) {
    const key = JSON.stringify([mode, spec.cloudModel, spec.system ?? null, spec.schema ?? null]);
    if (!models.has(key)) {
      const controller = new AbortController();
      models.set(key, { key, controller, model: sdk.getModel(buildModelParams(mode, spec, controller.signal)) });
    }
    return models.get(key);
  }

  // Chrome runs one local generation at a time, and a request issued while
  // another is running waits for it. So on-device requests go one by one.
  function inTurn(task) {
    const run = deviceQueue.then(task, task);
    deviceQueue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  async function ask(entry, request, onChunk) {
    const cancel = { signal: entry.controller.signal }; // cancels the HTTP request when the step runs in the cloud
    if (!onChunk) {
      const result = await entry.model.generateContent(request, cancel);
      return { text: result.response.text(), source: result.response.inferenceSource };
    }
    const result = await entry.model.generateContentStream(request, cancel);
    let text = '';
    for await (const chunk of result.stream) {
      const piece = chunk.text();
      text += piece;
      onChunk(piece, text);
    }
    const response = await result.response;
    return { text, source: response.inferenceSource };
  }

  // A local model can run on for minutes, and while it does, every later
  // request waits behind it. When the limit passes, the generation itself is
  // aborted, which frees the model at once. The model object is then dropped,
  // because its signal is spent: the next request builds a new one and the
  // SDK opens a new session for it.
  async function withLimit(entry, request, onChunk) {
    let timer;
    const limit = new Promise((_, reject) => {
      timer = setTimeout(() => {
        entry.controller.abort();
        models.delete(entry.key);
        const error = new Error(`no answer after ${Math.round(deviceTimeoutMs / 1000)} seconds`);
        error.code = 'timeout';
        reject(error);
      }, deviceTimeoutMs);
    });
    const pending = ask(entry, request, onChunk);
    pending.catch(() => {}); // the aborted request rejects after the limit already has
    try {
      return await Promise.race([pending, limit]);
    } finally {
      clearTimeout(timer);
    }
  }

  function invoke(mode, spec, request, onChunk) {
    if (mode === InferenceMode.ONLY_IN_CLOUD) return ask(modelFor(mode, spec), request, onChunk);
    return inTurn(() => {
      const entry = modelFor(mode, spec);
      return deviceTimeoutMs ? withLimit(entry, request, onChunk) : ask(entry, request, onChunk);
    });
  }

  async function run(routeName, options = {}) {
    const route = ROUTES[routeName];
    if (!route) throw new Error(`Unknown route: ${routeName}`);
    const { prompt, devicePrompt = prompt, system, deviceSystem = system, schema, deviceSchema = schema, confidential = true, onChunk, deviceOnChunk = onChunk } = options;
    const mode = modeFor(route.data, { confidential });
    const started = now();
    const device = await env.deviceAvailability();
    const cloudUsable = env.online() && env.cloudConfigured();
    const cloudDown = env.cloudConfigured() ? 'offline' : 'not-configured';
    const deviceDown = deviceReady(device) ? null : deviceCanBecomeReady(device) ? 'device-not-ready' : 'device-unavailable';
    const spec = { cloudModel: cloudModels[route.cloudModel], system, schema };
    const deviceSpec = { ...spec, system: deviceSystem, schema: deviceSchema };

    const base = { route: routeName, label: route.label, data: route.data, mode };
    const finish = (out, extra = {}) => {
      const entry = { ...base, source: out.source, ms: now() - started, attempts: 1, fallback: null, at: new Date(now()).toISOString(), ...extra };
      log(entry);
      return { ...entry, text: out.text };
    };
    const fail = (code, message, detail) => {
      log({ ...base, source: null, ms: now() - started, error: code, at: new Date(now()).toISOString() });
      throw new RouteError(code, message, detail);
    };
    const onDevice = async (extra) => {
      let out;
      try {
        out = await invoke(InferenceMode.ONLY_ON_DEVICE, deviceSpec, devicePrompt, deviceOnChunk);
      } catch (error) {
        fail(deviceFailure(error), `The local model could not finish this step: ${error.message}`, { cause: error });
      }
      return finish({ ...out, source: out.source ?? 'on_device' }, extra);
    };

    if (mode === InferenceMode.ONLY_ON_DEVICE) {
      if (deviceDown) fail(deviceDown, 'The local model is not ready, and this step is not allowed to use the cloud.', { device });
      return onDevice();
    }

    if (mode === InferenceMode.PREFER_ON_DEVICE) {
      if (!deviceDown) {
        let failure;
        try {
          return finish(await invoke(mode, spec, prompt, onChunk));
        } catch (error) {
          failure = deviceFailure(error);
          if (!cloudUsable) fail(failure, `The local model could not finish this step: ${error.message}`, { cause: error });
        }
        try {
          const out = await invoke(InferenceMode.ONLY_IN_CLOUD, spec, prompt, onChunk);
          return finish({ ...out, source: out.source ?? 'in_cloud' }, { fallback: { from: 'device', reason: failure } });
        } catch (error) {
          fail(classifyCloudError(error, env.online()), `Neither the local model nor the cloud could finish this step: ${error.message}`, { cause: error });
        }
      }
      if (!cloudUsable) fail('no-path', 'The local model is not available and the cloud cannot be reached.', { device: deviceDown, cloud: cloudDown });
      try {
        // The local model is missing, so the SDK sends this request to the cloud.
        return finish(await invoke(mode, spec, prompt, onChunk), { fallback: { from: 'device', reason: deviceDown } });
      } catch (error) {
        fail(classifyCloudError(error, env.online()), `The cloud could not finish this step: ${error.message}`, { cause: error });
      }
    }

    if (mode === InferenceMode.PREFER_IN_CLOUD) {
      if (cloudUsable) {
        let out;
        try {
          out = await invoke(mode, spec, prompt, onChunk);
        } catch (error) {
          fail(classifyCloudError(error, env.online()), `The cloud could not finish this step: ${error.message}`, { cause: error });
        }
        // On a network or HTTP error the SDK answers with the local model and
        // does not pass the error on, so the reason is limited to what the
        // browser knows.
        const fellBack = out.source === 'on_device';
        return finish(out, fellBack ? { fallback: { from: 'cloud', reason: env.online() ? 'cloud-error' : 'offline' } } : {});
      }
      if (deviceDown) fail('no-path', 'The cloud cannot be reached and the local model is not available.', { device: deviceDown, cloud: cloudDown });
      return onDevice({ fallback: { from: 'cloud', reason: cloudDown } });
    }

    // ONLY_IN_CLOUD: retry what is worth retrying, then say why it failed.
    let reason = cloudUsable ? null : cloudDown;
    let attempts = 0;
    while (cloudUsable) {
      attempts += 1;
      try {
        const out = await invoke(mode, spec, prompt, onChunk);
        return finish({ ...out, source: out.source ?? 'in_cloud' }, { attempts });
      } catch (error) {
        if (isRetryable(error) && attempts <= retryDelays.length) {
          await sleep(retryDelays[attempts - 1]);
          continue;
        }
        reason = classifyCloudError(error, env.online());
        break;
      }
    }
    if (!route.deviceFallback) fail(reason, 'The cloud could not be reached for this step.', { cloud: reason });
    if (deviceDown) fail('no-path', 'The cloud could not be reached and the local model is not available.', { device: deviceDown, cloud: reason });
    return onDevice({ attempts: Math.max(attempts, 1), fallback: { from: 'cloud', reason } });
  }

  /** Starts or resumes the one-time model download. Must follow a click or key press. */
  async function prepareDevice(onProgress) {
    const { model } = modelFor(InferenceMode.ONLY_ON_DEVICE, { cloudModel: cloudModels.light });
    await model.initializeDeviceModel(onProgress);
    return env.deviceAvailability();
  }

  return { run, prepareDevice };
}
