// Prompts for the report. The cloud prompt carries the tally sheet and nothing else.
import { outboundText } from './outbound.js';

export const REPORT_SYSTEM = `You write up open-ended survey results for the person who ran the survey.
You are given a tally sheet. You never see the answers themselves, so never quote a respondent and never invent what someone said.
Every number you mention must appear in the sheet.`;

export function reportPrompt(sheet) {
  return `This tally sheet is everything you know about the answers.

${outboundText(sheet)}

Write a report in Markdown with these sections, in this order:
## What people talked about most
## What is going well
## What to fix first
${sheet.safety_reports > 0 ? '## Safety reports\n' : ''}## Questions for next time

Name themes exactly as they are written in the sheet and give their counts. Use plain language and short paragraphs or bullet points. Stay under 280 words.
${sheet.safety_reports > 0 ? 'Under "Safety reports" give the count and say that the survey owner should read those answers personally and follow up. Do not guess what they say.\n' : ''}${sheet.approved_gists ? 'You may use the approved gists as examples in your own words. Do not present them as quotes.\n' : ''}`;
}

export const shortenPrompt = (report) => `Shorten this report to about half its length. Keep every section heading and every number.

${report}`;
