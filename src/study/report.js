// Prompts for the report. The cloud prompt carries the tally sheet and nothing else.
import { outboundText } from './outbound.js';
import { findUnsupported } from './facts.js';

const SAFETY_HEADING = '## Safety reports';
const REPORT_HEADINGS = [
  '## What people talked about most',
  '## What is going well',
  '## What to fix first',
  SAFETY_HEADING,
  '## Questions for next time',
];

export const REPORT_SYSTEM = `You write up open-ended survey results for the person who ran the survey.
You are given a tally sheet. You never see the answers themselves, so never quote a respondent and never invent what someone said.
Every number you mention must appear in the sheet.`;

export function reportPrompt(sheet) {
  return `This tally sheet is everything you know about the answers.

${outboundText(sheet)}

Write a report in Markdown with these sections, in this order:
${REPORT_HEADINGS.filter((heading) => heading !== SAFETY_HEADING || sheet.safety_reports > 0).join('\n')}

Name themes exactly as they are written in the sheet and give their counts. Use plain language and short paragraphs or bullet points. Stay under 280 words.
${sheet.safety_reports > 0 ? 'Under "Safety reports" give the count and say that the survey owner should read those answers personally and follow up. Do not guess what they say.\n' : ''}${sheet.approved_gists ? 'You may use the approved gists as examples in your own words. Do not present them as quotes.\n' : ''}`;
}

export function findReportIssues(text, sheet) {
  // The fixed section titles are labels, not statements the model made.
  const prose = text
    .split(/\r?\n/)
    .filter((line) => !REPORT_HEADINGS.includes(line.trim()))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1');
  return findUnsupported(prose, sheet);
}

export const shortenPrompt = (report) => `Shorten this report to about half its length. Keep every section heading and every number.

${report}`;
