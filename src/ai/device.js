// The local model's state. This is the only place the app touches Chrome's
// Prompt API directly, and only to ask whether the model is there. Every
// inference goes through Firebase AI Logic (see router.js).

export const TEXT_EN = Object.freeze([{ type: 'text', languages: ['en'] }]);

/**
 * @returns {Promise<'unsupported'|'unavailable'|'downloadable'|'downloading'|'available'>}
 */
export async function deviceAvailability(scope = globalThis) {
  const api = scope.LanguageModel;
  if (!api || typeof api.availability !== 'function') return 'unsupported';
  try {
    return await api.availability({ expectedInputs: TEXT_EN, expectedOutputs: TEXT_EN });
  } catch {
    return 'unavailable';
  }
}

export const deviceReady = (state) => state === 'available';
export const deviceCanBecomeReady = (state) => state === 'downloadable' || state === 'downloading';
