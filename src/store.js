// The study lives in this browser's storage and nowhere else.

const KEY = 'earshot.study.v1';

export function newStudy({ title = 'Untitled study', question = '', context = '', answers = [], themes = [], sample = false } = {}) {
  return { version: 1, title, question, context, confidential: true, sample, themes, answers, report: null };
}

export function loadStudy(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const study = JSON.parse(raw);
    return study?.version === 1 && Array.isArray(study.answers) ? study : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses to store the study (for example, storage is full). */
export function saveStudy(study, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(study));
    return true;
  } catch {
    return false;
  }
}

export function clearStudy(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
