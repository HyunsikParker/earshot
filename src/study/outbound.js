// Builds the one thing the cloud is ever given: the tally sheet.
import { tally } from './aggregate.js';
import { assertNoVerbatim, gistAllowed } from './guard.js';

export function approvedGists(study) {
  return study.answers
    .filter((a) => a.shareGist && a.reading?.gist && gistAllowed(a.reading.gist, a.text, study.themes.map((t) => t.name)).ok)
    .map((a) => a.reading.gist);
}

export function buildOutbound(study) {
  const t = tally(study);
  const gists = approvedGists(study);
  const sheet = {
    question: study.question,
    about: study.context,
    themes: study.themes.map(({ name, definition }) => ({ name, definition })),
    answers_received: t.answers,
    answers_read: t.read,
    tallies: t.themes.map((x) => ({ theme: x.name, answers: x.count, positive: x.positive, negative: x.negative, mixed: x.mixed, neutral: x.neutral })),
    answers_with_no_theme: t.noTheme,
    safety_reports: t.safetyReports,
    overall_tone: t.tone,
  };
  if (t.groups.length) sheet.by_group = t.groups;
  if (gists.length) sheet.approved_gists = gists;
  return sheet;
}

export const outboundText = (sheet) => JSON.stringify(sheet, null, 2);

/** Throws OutboundBlocked if the sheet carries any answer's wording. Returns its size otherwise. */
export function checkOutbound(sheet, study) {
  const authored = [study.question, study.context, ...study.themes.flatMap((t) => [t.name, t.definition])];
  assertNoVerbatim(sheet, study.answers, authored);
  return { bytes: new TextEncoder().encode(outboundText(sheet)).length };
}
