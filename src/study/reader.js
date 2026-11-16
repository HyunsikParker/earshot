// Reading: the local model labels one answer at a time.
import { SENTIMENTS } from './aggregate.js';

export function readSchema(themes) {
  return {
    type: 'object',
    properties: {
      // Without these limits the local model can repeat itself until it hits its output limit.
      themes: { type: 'array', maxItems: themes.length, items: { type: 'string', enum: themes.map((t) => t.id) } },
      sentiment: { type: 'string', enum: SENTIMENTS },
      safety_report: { type: 'boolean' },
      gist: { type: 'string', maxLength: 200 },
    },
    required: ['themes', 'sentiment', 'safety_report', 'gist'],
  };
}

export function readSystem({ question, context, themes }) {
  const about = [context, question ? `Question asked: "${question}"` : ''].filter(Boolean).join(' ');
  return `You label survey comments for an analyst. Context: ${about}
Themes:
${themes.map((t) => `- ${t.id}: ${t.definition || t.name}`).join('\n')}
Rules: choose every theme the comment is clearly about, and none if no theme fits. sentiment is the writer's overall tone. safety_report is true only when the comment reports harassment, discrimination, or feeling unsafe. gist is one neutral sentence, at most 15 words, with no names, emails or other identifying details. You answer with JSON only.`;
}

export const answerPrompt = (text) => `Comment: "${text}"`;

/** Turns the model's text into a reading, or null when it is not usable. */
export function normalizeReading(text, themes) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !SENTIMENTS.includes(raw.sentiment)) return null;
  const known = new Set(themes.map((t) => t.id));
  const picked = Array.isArray(raw.themes) ? raw.themes.filter((id) => known.has(id)) : [];
  return {
    themes: [...new Set(picked)],
    sentiment: raw.sentiment,
    flag: raw.safety_report === true,
    gist: String(raw.gist ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
  };
}

// One answer the model cannot finish must not stop the rest.
const ONE_ANSWER_FAILED = new Set(['device-error', 'device-timeout']);
export const GIVE_UP_AFTER = 3; // answers in a row that failed with an error
export const GIVE_UP_AFTER_TIMEOUTS = 2; // answers in a row that got no reply in time

/**
 * Reads every answer that has no reading yet, in order, one at a time.
 * Stops between answers when `shouldStop()` turns true. An answer the model
 * cannot finish is marked for labelling by hand and the run goes on: after two
 * attempts when the model returned an error, after one when it gave no reply
 * in time, because a silent model is not the answer's fault. A missing model,
 * three failed answers in a row or two timed-out answers in a row end the run
 * with the error and leave those answers unread.
 */
export async function readAll({ study, router, onReading, shouldStop = () => false }) {
  const system = readSystem(study);
  const schema = readSchema(study.themes);
  let done = 0;
  const failedInARow = [];
  for (const answer of study.answers) {
    if (answer.reading) continue;
    if (shouldStop()) return { stopped: true, done };
    let reading = null;
    let step = { source: null, ms: 0 };
    let lastError = null;
    for (let attempt = 0; attempt < 2 && !reading; attempt += 1) {
      try {
        step = await router.run('read', { prompt: answerPrompt(answer.text), system, schema, confidential: study.confidential });
        reading = normalizeReading(step.text, study.themes);
        lastError = null;
      } catch (error) {
        if (!ONE_ANSWER_FAILED.has(error?.code)) throw error;
        lastError = error;
        if (error.code === 'device-timeout') break;
      }
    }
    if (lastError) failedInARow.push({ answer, timedOut: lastError.code === 'device-timeout' });
    else failedInARow.length = 0;
    const timeouts = failedInARow.filter((f) => f.timedOut).length;
    if (failedInARow.length >= GIVE_UP_AFTER || timeouts >= GIVE_UP_AFTER_TIMEOUTS) {
      // The model itself is failing. Leave these answers unread so they are tried again later.
      failedInARow.forEach((f) => {
        f.answer.reading = null;
      });
      throw lastError;
    }
    answer.reading = reading
      ? { ...reading, source: step.source, ms: step.ms, edited: false }
      : { failed: true, themes: [], sentiment: 'neutral', flag: false, gist: '', source: step.source, ms: step.ms, edited: false };
    done += 1;
    onReading?.(answer);
  }
  return { stopped: false, done };
}
