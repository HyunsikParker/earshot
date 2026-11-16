// Checks on text that is about to leave the computer.

const IDENTIFIER_PATTERNS = [
  ['an email address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['a link', /\b(?:https?:\/\/|www\.)\S+/i],
  ['a phone number', /\+?\d[\d ().-]{7,}\d/],
  ['a user handle', /(?:^|\s)@[A-Za-z0-9_]{2,}/],
  ['a long number', /\b\d{6,}\b/],
];

export function findIdentifiers(text) {
  const found = [];
  for (const [kind, pattern] of IDENTIFIER_PATTERNS) {
    const match = String(text).match(pattern);
    if (match) found.push({ kind, match: match[0].trim() });
  }
  return found;
}

export function words(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
}

/** Every run of `size` consecutive words, as a set of strings. */
export function wordRuns(text, size = 4) {
  const list = words(text);
  const runs = new Set();
  for (let i = 0; i + size <= list.length; i += 1) runs.add(list.slice(i, i + size).join(' '));
  return runs;
}

export function sharedRun(candidate, source, size = 4) {
  const sourceRuns = wordRuns(source, size);
  for (const run of wordRuns(candidate, size)) if (sourceRuns.has(run)) return run;
  return null;
}

const NOT_NAMES = new Set(['wi-fi', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
const TITLES = /(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+$/;

/** Capitalised words such as "Marisol" or "Al-Sayed", with whether each one starts a sentence. */
function capitalised(text) {
  const out = [];
  const source = String(text);
  for (const match of source.matchAll(/\p{Lu}\p{Ll}+(?:[-'\u2019]\p{L}+)*/gu)) {
    const before = source.slice(0, match.index);
    const startsSentence = /(?:^|[.!?]["')\]]?\s+|\n)["'(\[]?$/.test(before) && !TITLES.test(before);
    out.push({ word: match[0], key: match[0].toLowerCase(), startsSentence });
  }
  return out;
}

/**
 * A capitalised word that the gist carries over from the answer, which is how
 * names of people, employers and places usually look. Words that only ever
 * start a sentence cannot be told apart from ordinary words and are not caught.
 */
export function copiedName(gist, answerText, allow = []) {
  const allowed = new Set([...NOT_NAMES, ...allow.flatMap((item) => words(item))]);
  // word -> whether the answer uses it capitalised in the middle of a sentence
  const inAnswer = new Map();
  for (const item of capitalised(answerText)) inAnswer.set(item.key, (inAnswer.get(item.key) ?? false) || !item.startsSentence);
  for (const item of capitalised(gist)) {
    if (allowed.has(item.key) || !inAnswer.has(item.key)) continue;
    if (!item.startsSentence || inAnswer.get(item.key)) return item.word;
  }
  return null;
}

/**
 * A gist may leave only if it carries no contact detail, no capitalised word
 * taken from the answer, and none of the answer's wording.
 */
export function gistAllowed(gist, answerText, allow = []) {
  if (!gist || !gist.trim()) return { ok: false, reason: 'There is no gist for this answer.' };
  const identifiers = findIdentifiers(gist);
  if (identifiers.length) return { ok: false, reason: `The gist contains ${identifiers[0].kind}.` };
  const name = copiedName(gist, answerText, allow);
  if (name) return { ok: false, reason: `The gist repeats a name from the answer ("${name}").` };
  const run = sharedRun(gist, answerText);
  if (run) return { ok: false, reason: `The gist repeats the answer's wording ("${run}").` };
  return { ok: true, reason: '' };
}

export class OutboundBlocked extends Error {
  constructor(answerId, run) {
    super(`The sheet contains wording from an answer ("${run}"). Nothing was sent.`);
    this.name = 'OutboundBlocked';
    this.answerId = answerId;
    this.run = run;
  }
}

function stringsIn(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => stringsIn(v, out));
  return out;
}

/**
 * Last check before a cloud request. Throws if any string in `payload` contains
 * four consecutive words taken from any answer. Wording the analyst wrote
 * (question, context, theme names and definitions) is theirs to send and is
 * not counted.
 */
export function assertNoVerbatim(payload, answers, authoredTexts = [], size = 4) {
  const authored = new Set();
  for (const text of authoredTexts) for (const run of wordRuns(text, size)) authored.add(run);
  const outgoing = new Set();
  for (const text of stringsIn(payload)) for (const run of wordRuns(text, size)) if (!authored.has(run)) outgoing.add(run);
  if (outgoing.size === 0) return;
  for (const answer of answers) {
    for (const run of wordRuns(answer.text, size)) if (outgoing.has(run)) throw new OutboundBlocked(answer.id, run);
  }
}
