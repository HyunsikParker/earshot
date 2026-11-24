import { describe, expect, it, vi } from 'vitest';
import { InferenceMode } from 'firebase/ai';
import { createRouter, classifyCloudError, buildModelParams, RouteError } from '../src/ai/router.js';
import { modeFor, DataClass, ROUTES } from '../src/ai/routes.js';
import { deviceAvailability } from '../src/ai/device.js';
import { aiError, fakeEnv, fakeSdk, MODELS } from './helpers/fakes.js';

function setup({ sdk = {}, env = {}, ...rest } = {}) {
  const s = fakeSdk(sdk);
  const e = fakeEnv(env);
  s.state.device = e.device;
  const log = [];
  const sleep = vi.fn(async () => {});
  const router = createRouter({ sdk: s, env: e, cloudModels: MODELS, log: (entry) => log.push(entry), sleep, ...rest });
  return { router, sdk: s, env: e, log, sleep };
}

describe('routing policy', () => {
  it('maps each kind of data to one inference mode', () => {
    expect(modeFor(DataClass.ANSWERS, { confidential: true })).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(modeFor(DataClass.ANSWERS, { confidential: false })).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(modeFor(DataClass.ANSWERS)).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(modeFor(DataClass.QUESTION)).toBe(InferenceMode.PREFER_IN_CLOUD);
    expect(modeFor(DataClass.TALLIES)).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(modeFor(DataClass.REPORT)).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(() => modeFor('something else')).toThrow();
  });

  it('uses all four SDK modes across the routes', () => {
    const modes = new Set(Object.values(ROUTES).flatMap((r) => [modeFor(r.data, { confidential: true }), modeFor(r.data, { confidential: false })]));
    expect([...modes].sort()).toEqual(Object.values(InferenceMode).sort());
  });
});

describe('reading confidential answers', () => {
  it('runs on the device and never calls the cloud', async () => {
    const { router, sdk, log } = setup();
    const out = await router.run('read', { prompt: 'Comment: "x"', confidential: true });
    expect(out).toMatchObject({ source: 'on_device', mode: InferenceMode.ONLY_ON_DEVICE, fallback: null, text: 'device text' });
    expect(sdk.calls.cloud).toBe(0);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ route: 'read', data: 'answers', source: 'on_device' });
  });

  it.each([
    ['unsupported', 'device-unavailable'],
    ['unavailable', 'device-unavailable'],
    ['downloadable', 'device-not-ready'],
    ['downloading', 'device-not-ready'],
  ])('refuses instead of uploading when the local model is %s', async (device, code) => {
    const { router, sdk, log } = setup({ env: { device, online: true, configured: true } });
    await expect(router.run('read', { prompt: 'p', confidential: true })).rejects.toMatchObject({ name: 'RouteError', code });
    expect(sdk.calls.cloud).toBe(0);
    expect(sdk.calls.device).toBe(0);
    expect(log[0]).toMatchObject({ error: code, source: null });
  });

  it('reports a local model failure without trying the cloud', async () => {
    const { router, sdk } = setup({ sdk: { deviceText: () => { throw new Error('input too large'); } } });
    await expect(router.run('read', { prompt: 'p', confidential: true })).rejects.toMatchObject({ code: 'device-error' });
    expect(sdk.calls.cloud).toBe(0);
  });
});

describe('reading answers that are not confidential', () => {
  it('stays on the device when the local model is ready', async () => {
    const { router, sdk } = setup();
    const out = await router.run('read', { prompt: 'p', confidential: false });
    expect(out).toMatchObject({ source: 'on_device', mode: InferenceMode.PREFER_ON_DEVICE, fallback: null });
    expect(sdk.calls.cloud).toBe(0);
  });

  it('lets the SDK fall back to the cloud when there is no local model', async () => {
    const { router, sdk } = setup({ env: { device: 'unsupported' } });
    const out = await router.run('read', { prompt: 'p', confidential: false });
    expect(out).toMatchObject({ source: 'in_cloud', fallback: { from: 'device', reason: 'device-unavailable' } });
    expect(sdk.calls.requests[0].mode).toBe(InferenceMode.PREFER_ON_DEVICE);
  });

  it('has no path when the device is missing and the browser is offline', async () => {
    const { router } = setup({ env: { device: 'unsupported', online: false } });
    await expect(router.run('read', { prompt: 'p', confidential: false })).rejects.toMatchObject({ code: 'no-path', detail: { device: 'device-unavailable', cloud: 'offline' } });
  });

  it('moves to the cloud when the local model fails mid-request', async () => {
    const { router } = setup({ sdk: { deviceText: () => { throw new Error('boom'); } } });
    const out = await router.run('shorten', { prompt: 'p' });
    expect(out).toMatchObject({ source: 'in_cloud', fallback: { from: 'device', reason: 'device-error' } });
  });

  it.each(['read', 'discover'])('reserves budget before sending hosted %s to the cloud', async (route) => {
    const reserveCloudRead = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { router, sdk } = setup({ env: { device: 'downloading' }, reserveCloudRead });
    const options = { prompt: 'public answers', confidential: false };
    await expect(router.run(route, options)).resolves.toMatchObject({ source: 'in_cloud' });
    await expect(router.run(route, options)).rejects.toMatchObject({ code: 'cloud-read-limit' });
    expect(reserveCloudRead).toHaveBeenCalledTimes(2);
    expect(sdk.calls.requests).toEqual([expect.objectContaining({ mode: InferenceMode.ONLY_IN_CLOUD, path: 'cloud' })]);
  });

  it('never spends hosted budget on the local path and cannot fall back past the cap', async () => {
    const reserveCloudRead = vi.fn(async () => false);
    const deviceText = vi.fn().mockResolvedValueOnce('local labels').mockRejectedValueOnce(new Error('local failed'));
    const { router, sdk } = setup({ sdk: { deviceText }, reserveCloudRead });
    const options = { prompt: 'public answer', confidential: false };
    await expect(router.run('read', options)).resolves.toMatchObject({ source: 'on_device' });
    expect(reserveCloudRead).not.toHaveBeenCalled();
    await expect(router.run('read', options)).rejects.toMatchObject({ code: 'cloud-read-limit' });
    expect(reserveCloudRead).toHaveBeenCalledTimes(1);
    expect(sdk.calls.requests.map((request) => request.mode)).toEqual([InferenceMode.ONLY_ON_DEVICE, InferenceMode.ONLY_ON_DEVICE]);
    expect(sdk.calls.cloud).toBe(0);
  });

  it('does not spend hosted budget on confidential reads or cloud reports', async () => {
    const reserveCloudRead = vi.fn(async () => false);
    const { router, sdk } = setup({ env: { device: 'unsupported' }, reserveCloudRead });
    await expect(router.run('read', { prompt: 'confidential answer' })).rejects.toMatchObject({ code: 'device-unavailable' });
    await expect(router.run('report', { prompt: 'sheet' })).resolves.toMatchObject({ source: 'in_cloud' });
    expect(reserveCloudRead).not.toHaveBeenCalled();
    expect(sdk.calls.cloud).toBe(1);
  });
});

describe('suggesting themes from the question (prefer cloud)', () => {
  it('answers in the cloud when it is reachable', async () => {
    const { router } = setup();
    expect(await router.run('suggest', { prompt: 'p' })).toMatchObject({ source: 'in_cloud', mode: InferenceMode.PREFER_IN_CLOUD, fallback: null });
  });

  it('notes the fallback when the SDK answers on the device after a quota error', async () => {
    const { router, sdk } = setup({ sdk: { cloud: () => { throw aiError('fetch-error', 429); } } });
    const out = await router.run('suggest', { prompt: 'p' });
    expect(out).toMatchObject({ source: 'on_device', fallback: { from: 'cloud', reason: 'cloud-error' } });
    expect(sdk.calls.cloud).toBe(1);
  });

  it.each([
    [{ online: false }, 'offline'],
    [{ configured: false }, 'not-configured'],
  ])('skips the cloud request entirely when %o', async (env, reason) => {
    const { router, sdk } = setup({ env });
    const out = await router.run('suggest', { prompt: 'cloud prompt', devicePrompt: 'device prompt' });
    expect(out).toMatchObject({ source: 'on_device', fallback: { from: 'cloud', reason } });
    expect(sdk.calls.cloud).toBe(0);
    expect(sdk.calls.requests[0]).toMatchObject({ request: 'device prompt', mode: InferenceMode.ONLY_ON_DEVICE });
  });

  it('fails with the cloud reason when the SDK cannot fall back', async () => {
    const { router } = setup({ env: { device: 'unsupported' }, sdk: { cloud: () => { throw aiError('fetch-error', 403); } } });
    await expect(router.run('suggest', { prompt: 'p' })).rejects.toMatchObject({ code: 'blocked' });
  });
});

describe('writing the report (cloud, with a device variant)', () => {
  it('uses the writing model in the cloud', async () => {
    const { router, sdk } = setup();
    const out = await router.run('report', { prompt: 'sheet' });
    expect(out).toMatchObject({ source: 'in_cloud', mode: InferenceMode.ONLY_IN_CLOUD, attempts: 1, fallback: null });
    expect(sdk.calls.params[0].inCloudParams.model).toBe('writing-model');
  });

  it('retries 429 once on the alternate model and then succeeds', async () => {
    const cloud = vi.fn((request, params, n) => { if (n === 1) throw aiError('fetch-error', 429); return 'report'; });
    const { router, sdk, sleep } = setup({ sdk: { cloud } });
    const out = await router.run('report', { prompt: 'sheet' });
    expect(out).toMatchObject({ source: 'in_cloud', attempts: 2, text: 'report' });
    expect(sdk.calls.params.map((params) => params.inCloudParams.model)).toEqual([MODELS.writing, MODELS.writingFallback]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([800]);
  });

  it('keeps the backoff retries on the same model for HTTP 503', async () => {
    const cloud = vi.fn((request, params, n) => { if (n < 3) throw aiError('fetch-error', 503); return 'report'; });
    const { router, sdk, sleep } = setup({ sdk: { cloud } });
    const out = await router.run('report', { prompt: 'sheet' });
    expect(out).toMatchObject({ source: 'in_cloud', attempts: 3, text: 'report' });
    expect(sdk.calls.params.map((params) => params.inCloudParams.model)).toEqual([MODELS.writing]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([800, 2400]);
  });

  it('makes only one alternate request after an interrupted report stream', async () => {
    const cloud = vi.fn()
      .mockRejectedValueOnce(aiError('parse-failed'))
      .mockRejectedValueOnce(aiError('fetch-error', 503));
    const { router, sdk, sleep } = setup({ sdk: { cloud } });
    const onStreamRetry = vi.fn();
    const out = await router.run('report', { prompt: 'sheet', onChunk: vi.fn(), deviceOnChunk: null, onStreamRetry });
    expect(out).toMatchObject({ source: 'on_device', attempts: 2, fallback: { from: 'cloud', reason: 'unavailable' } });
    expect(sdk.calls.params.slice(0, 2).map((params) => params.inCloudParams.model)).toEqual([MODELS.writing, MODELS.writingFallback]);
    expect(cloud).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(onStreamRetry).toHaveBeenCalledOnce();
  });

  it('does not report a successful cloud write when the response has no report text', async () => {
    const { router, sdk } = setup({ env: { device: 'unavailable' }, sdk: { cloud: () => ' \n' } });
    await expect(router.run('report', { prompt: 'sheet', onChunk: vi.fn() }))
      .rejects.toMatchObject({ code: 'no-path', detail: { cloud: 'incomplete-response' } });
    expect(sdk.calls.cloud).toBe(1);
  });

  it('gives up after the retries and writes on the device with the device prompt', async () => {
    const { router, sdk, sleep } = setup({ sdk: { cloud: () => { throw aiError('fetch-error', 429); } } });
    const out = await router.run('report', { prompt: 'cloud prompt', devicePrompt: 'device prompt', system: 'cloud system', deviceSystem: 'device system' });
    expect(out).toMatchObject({ source: 'on_device', attempts: 2, fallback: { from: 'cloud', reason: 'quota' } });
    expect(sdk.calls.cloud).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sdk.calls.requests.at(-1)).toMatchObject({ path: 'device', request: 'device prompt' });
    expect(sdk.calls.params.at(-1).onDeviceParams.createOptions.initialPrompts[0].content[0].value).toBe('device system');
  });

  it.each([
    [() => aiError('fetch-error', 403), true, 'blocked', 1],
    [() => aiError('fetch-error', 500), true, 'unavailable', 1],
    [() => aiError('error'), true, 'network', 1],
    [() => aiError('error'), false, 'offline', 1],
  ])('does not retry %s and records why', async (make, onlineAfter, reason, cloudCalls) => {
    const { router, sdk, env } = setup({ sdk: { cloud: () => { env.isOnline = onlineAfter; throw make(); } } });
    const out = await router.run('report', { prompt: 'p' });
    expect(out.fallback).toEqual({ from: 'cloud', reason });
    expect(sdk.calls.cloud).toBe(cloudCalls);
  });

  it.each([
    [{ configured: false }, 'not-configured'],
    [{ online: false }, 'offline'],
  ])('goes straight to the device when %o', async (env, reason) => {
    const { router, sdk } = setup({ env });
    const out = await router.run('report', { prompt: 'p' });
    expect(out).toMatchObject({ source: 'on_device', fallback: { from: 'cloud', reason } });
    expect(sdk.calls.cloud).toBe(0);
  });

  it('says so when neither path exists', async () => {
    const { router } = setup({ env: { configured: false, device: 'unsupported' } });
    const error = await router.run('report', { prompt: 'p' }).catch((e) => e);
    expect(error).toBeInstanceOf(RouteError);
    expect(error).toMatchObject({ code: 'no-path', detail: { cloud: 'not-configured', device: 'device-unavailable' } });
  });

  it('streams text as it arrives', async () => {
    const { router } = setup({ sdk: { cloud: () => 'A report in pieces.' } });
    const seen = [];
    const out = await router.run('report', { prompt: 'p', onChunk: (piece, all) => seen.push(all) });
    expect(seen.at(-1)).toBe('A report in pieces.');
    expect(seen.length).toBeGreaterThan(1);
    expect(out.text).toBe('A report in pieces.');
  });
});

describe('router mechanics', () => {
  it('runs on-device requests one at a time', async () => {
    let active = 0;
    let peak = 0;
    const deviceText = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return 'ok';
    };
    const { router } = setup({ sdk: { deviceText } });
    await Promise.all([1, 2, 3, 4].map((n) => router.run('read', { prompt: `p${n}` })));
    expect(peak).toBe(1);
  });

  it('keeps the queue moving after a failed request', async () => {
    let n = 0;
    const { router } = setup({ sdk: { deviceText: () => { n += 1; if (n === 1) throw new Error('first fails'); return 'ok'; } } });
    const results = await Promise.allSettled([router.run('read', { prompt: 'a' }), router.run('read', { prompt: 'b' })]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });

  it('aborts a local generation that runs on, retires that model and answers the next request on a new one', async () => {
    let n = 0;
    const { router, sdk, log } = setup({ deviceTimeoutMs: 20, sdk: { deviceText: () => { n += 1; return n === 1 ? new Promise(() => {}) : 'ok'; } } });
    await expect(router.run('read', { prompt: 'a' })).rejects.toMatchObject({ code: 'device-timeout' });
    expect(log[0]).toMatchObject({ error: 'device-timeout' });
    expect(sdk.calls.aborted).toBe(1);
    const [first] = sdk.calls.params;
    expect(first.onDeviceParams.promptOptions.signal.aborted).toBe(true);
    expect(first.onDeviceParams.createOptions.signal).toBe(first.onDeviceParams.promptOptions.signal);

    expect(await router.run('read', { prompt: 'b' })).toMatchObject({ source: 'on_device', text: 'ok' });
    expect(sdk.calls.params).toHaveLength(2);
    expect(sdk.calls.params[1].onDeviceParams.promptOptions.signal.aborted).toBe(false);
    expect(sdk.calls.aborted).toBe(1);
    expect(sdk.calls.cloud).toBe(0);
  });

  it('does not abort or replace a model that answers in time', async () => {
    const { router, sdk } = setup({ deviceTimeoutMs: 200 });
    await router.run('read', { prompt: 'a' });
    await router.run('read', { prompt: 'b' });
    await new Promise((r) => setTimeout(r, 250));
    expect(sdk.calls.params).toHaveLength(1);
    expect(sdk.calls.aborted).toBe(0);
    expect(sdk.calls.params[0].onDeviceParams.promptOptions.signal.aborted).toBe(false);
  });

  it('gives the same signal to the cloud request, so one abort stops either path', async () => {
    const { router, sdk } = setup();
    await router.run('suggest', { prompt: 'p' });
    expect(sdk.calls.options[0].signal).toBe(sdk.calls.params[0].onDeviceParams.promptOptions.signal);
  });

  it('falls back to the cloud after an on-device timeout when the data allows it', async () => {
    const { router } = setup({ deviceTimeoutMs: 20, sdk: { deviceText: () => new Promise(() => {}) } });
    expect(await router.run('shorten', { prompt: 'p' })).toMatchObject({ source: 'in_cloud', fallback: { from: 'device', reason: 'device-timeout' } });
  });

  it('reuses one model per configuration', async () => {
    const { router, sdk } = setup();
    await router.run('read', { prompt: 'a', system: 's', schema: { type: 'object' } });
    await router.run('read', { prompt: 'b', system: 's', schema: { type: 'object' } });
    expect(sdk.calls.params).toHaveLength(1);
  });

  it('starts the model download and reports progress', async () => {
    const { router, env, sdk } = setup({ env: { device: 'downloadable' } });
    const progress = [];
    env.deviceAvailability = async () => sdk.state.device;
    expect(await router.prepareDevice((p) => progress.push(p))).toBe('available');
    expect(progress).toEqual([0.5, 1]);
  });

  it('builds text-only device options and gives both paths the same schema and instructions', () => {
    const schema = { type: 'object', properties: {} };
    const params = buildModelParams(InferenceMode.PREFER_ON_DEVICE, { cloudModel: 'm', system: 'be brief', schema });
    expect(params.onDeviceParams.createOptions.expectedInputs).toEqual([{ type: 'text', languages: ['en'] }]);
    expect(params.onDeviceParams.createOptions.initialPrompts[0]).toEqual({ role: 'system', content: [{ type: 'text', value: 'be brief' }] });
    expect(params.onDeviceParams.promptOptions.responseConstraint).toBe(schema);
    expect(params.onDeviceParams.createOptions.signal).toBeUndefined();
    const controller = new AbortController();
    const withSignal = buildModelParams(InferenceMode.ONLY_ON_DEVICE, { cloudModel: 'm' }, controller.signal);
    expect(withSignal.onDeviceParams.promptOptions).toEqual({ signal: controller.signal });
    expect(withSignal.onDeviceParams.createOptions.signal).toBe(controller.signal);
    expect(params.inCloudParams).toEqual({ model: 'm', systemInstruction: 'be brief', generationConfig: { responseMimeType: 'application/json', responseSchema: schema } });
  });

  it('classifies cloud failures', () => {
    expect(classifyCloudError(aiError('fetch-error', 429))).toBe('quota');
    expect(classifyCloudError(aiError('fetch-error', 401))).toBe('blocked');
    expect(classifyCloudError(aiError('fetch-error', 503))).toBe('unavailable');
    expect(classifyCloudError(aiError('fetch-error', 400))).toBe('cloud-error');
    expect(classifyCloudError(aiError('api-not-enabled'))).toBe('blocked');
    expect(classifyCloudError(aiError('error'))).toBe('network');
    expect(classifyCloudError(new Error('odd'))).toBe('cloud-error');
    expect(classifyCloudError(aiError('fetch-error', 429), false)).toBe('offline');
  });
});

describe('local model state', () => {
  it('reports unsupported when the browser has no Prompt API', async () => {
    expect(await deviceAvailability({})).toBe('unsupported');
  });

  it('passes through the browser state and asks for text only', async () => {
    const availability = vi.fn(async () => 'downloadable');
    expect(await deviceAvailability({ LanguageModel: { availability } })).toBe('downloadable');
    expect(availability).toHaveBeenCalledWith({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
  });

  it('treats a throwing availability check as unavailable', async () => {
    expect(await deviceAvailability({ LanguageModel: { availability: async () => { throw new Error('no'); } } })).toBe('unavailable');
  });
});
