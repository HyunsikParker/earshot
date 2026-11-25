import { describe, expect, it } from 'vitest';
import { sheetFacts, fallbackReport, findUnsupported, parsePicks, pickPrompt, pickSchema, LEAD_MAX } from '../src/study/facts.js';
import { findReportIssues, reportPrompt } from '../src/study/report.js';
import { copiedName, gistAllowed } from '../src/study/guard.js';
import CLOUD_REPORT from './fixtures/cloud-report-2026-11-25.json';
import { createRouter } from '../src/ai/router.js';
import { aiError, fakeEnv, fakeSdk, MODELS } from './helpers/fakes.js';

// The tally sheet of the sample study as it was read in Chrome on 2026-11-15.
const SHEET = {
  question: 'What should we change next year?',
  about: 'Post-event survey for a two-day developer conference.',
  themes: [],
  answers_received: 64,
  answers_read: 64,
  tallies: [
    { theme: 'Schedule', answers: 12, positive: 2, negative: 9, mixed: 1, neutral: 0 },
    { theme: 'Content', answers: 13, positive: 3, negative: 9, mixed: 1, neutral: 0 },
    { theme: 'Venue', answers: 14, positive: 1, negative: 13, mixed: 0, neutral: 0 },
    { theme: 'Food', answers: 8, positive: 3, negative: 5, mixed: 0, neutral: 0 },
    { theme: 'Networking', answers: 10, positive: 5, negative: 4, mixed: 1, neutral: 0 },
    { theme: 'Organization', answers: 18, positive: 5, negative: 13, mixed: 0, neutral: 0 },
  ],
  answers_with_no_theme: 2,
  safety_reports: 3,
  overall_tone: { positive: 17, negative: 44, mixed: 2, neutral: 1 },
  by_group: [
    { group: 'First-time', answers: 32, themes: { Schedule: 5, Content: 'fewer than 3', Venue: 9, Food: 4, Networking: 8, Organization: 11 } },
    { group: 'Returning', answers: 32, themes: { Schedule: 7, Content: 11, Venue: 5, Food: 4, Networking: 'fewer than 3', Organization: 7 } },
  ],
};

// What the local model wrote for this sheet before the fix (unit 1, 2026-11-15T07:29Z).
const OLD_DEVICE_REPORT = `Here's a summary of the survey results:

Biggest Concerns: Venue (14 answers), Organization (18 answers), and Content (13 answers) were the most frequently mentioned areas for change.
What's Working Well: Networking (10 answers) received the most positive feedback.
First Priority: Organization (18 answers) received the most negative feedback and should be addressed first.
Food (8 answers) received the most negative feedback.
Follow-Up: 3 safety reports require personal follow-up.`;

describe('statements read off the tally sheet', () => {
  it('states leaders, ties, tone, gaps and group leaders exactly as counted', () => {
    const { headline, counts } = sheetFacts(SHEET);
    expect(Object.fromEntries(headline.map((f) => [f.id, f.text]))).toEqual({
      safety: '3 answers were marked as safety reports.',
      'most-mentioned': 'Organization came up most often, in 18 answers.',
      'most-negative': 'Venue and Organization had the most negative answers: 13 each.',
      'most-positive': 'Networking and Organization had the most positive answers: 5 each.',
      tone: 'Across the 64 answers read, the tone was 44 negative, 17 positive, 2 mixed and 1 neutral.',
      'no-theme': '2 answers fit none of the themes.',
      'group:First-time': 'In the "First-time" group (32 answers), Organization came up most often, in 11.',
      'group:Returning': 'In the "Returning" group (32 answers), Content came up most often, in 11.',
      read: 'All 64 answers were read.',
    });
    expect(counts[0]).toBe('Organization: 18 answers (13 negative, 5 positive).');
    expect(counts).toHaveLength(6);
  });

  it('handles single answers, unread answers and themes nobody mentioned', () => {
    const sheet = { ...SHEET, answers_received: 5, answers_read: 3, safety_reports: 1, answers_with_no_theme: 1, by_group: undefined, overall_tone: { positive: 0, negative: 2, mixed: 0, neutral: 1 }, tallies: [{ theme: 'Venue', answers: 2, positive: 0, negative: 2, mixed: 0, neutral: 0 }, { theme: 'Food', answers: 0, positive: 0, negative: 0, mixed: 0, neutral: 0 }] };
    const texts = sheetFacts(sheet).headline.map((f) => f.text);
    expect(texts).toEqual([
      '1 answer was marked as a safety report.',
      'Venue came up most often, in 2 answers.',
      'Venue had the most negative answers: 2 of its 2.',
      'Across the 3 answers read, the tone was 2 negative and 1 neutral.',
      '1 answer fits none of the themes.',
      '3 of 5 answers have been read so far.',
    ]);
    expect(sheetFacts(sheet).counts).toEqual(['Venue: 2 answers (2 negative).', 'Food: 0 answers.']);
    expect(findUnsupported(fallbackReport(sheet), sheet)).toEqual([]);
  });
});

describe('the report shown when the cloud cannot write one', () => {
  it('leads with safety reports, then the model picks, then every count', () => {
    const facts = sheetFacts(SHEET);
    const picks = parsePicks('{"picks":["4","2","4","99","x","6"]}', facts);
    expect(picks).toEqual(['most-positive', 'most-mentioned', 'no-theme']);
    const report = fallbackReport(SHEET, picks);
    expect(report.split('\n').slice(0, 5)).toEqual([
      '## Summary of the counts',
      '- 3 answers were marked as safety reports.',
      '- Networking and Organization had the most positive answers: 5 each.',
      '- Organization came up most often, in 18 answers.',
      '- 2 answers fit none of the themes.',
    ]);
    expect(report).toContain('## Counts by theme\n- Organization: 18 answers (13 negative, 5 positive).');
    expect(report.match(/^- /gm)).toHaveLength(4 + 6);
  });

  it('falls back to a fixed order when the model returns nothing usable', () => {
    for (const bad of ['', 'not json', '{"picks":"1"}', '{"picks":[]}']) {
      const report = fallbackReport(SHEET, parsePicks(bad, sheetFacts(SHEET)));
      expect(report.split('\n').slice(1, 5)).toEqual([
        '- 3 answers were marked as safety reports.',
        '- Organization came up most often, in 18 answers.',
        '- Venue and Organization had the most negative answers: 13 each.',
        '- Networking and Organization had the most positive answers: 5 each.',
      ]);
    }
    expect(fallbackReport(SHEET, sheetFacts(SHEET).headline.map((f) => f.id)).match(/^- /gm)).toHaveLength(LEAD_MAX + 6);
  });

  it('asks the model only to choose among numbered true statements', () => {
    const facts = sheetFacts(SHEET);
    expect(pickPrompt(SHEET, facts)).toContain('2. Organization came up most often, in 18 answers.');
    expect(pickSchema(facts).properties.picks.items.enum).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('contains no statement the sheet does not support, whatever the model picks', () => {
    expect(findUnsupported(fallbackReport(SHEET), SHEET)).toEqual([]);
    expect(findUnsupported(fallbackReport(SHEET, sheetFacts(SHEET).headline.map((f) => f.id).reverse()), SHEET)).toEqual([]);
  });

  it('holds for 300 generated sheets with ties, empty themes, awkward names and withheld cells', () => {
    let seed = 20261115;
    const rand = (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const names = ['Schedule', 'Content', 'Venue', 'Food & drink', 'Top speakers', 'Follow-up', 'Room 101', 'Organization'];
    for (let run = 0; run < 300; run += 1) {
      const tallies = names.slice(0, 2 + rand(7)).map((theme) => {
        const negative = rand(4) === 0 ? 7 : rand(15);
        const positive = rand(4) === 0 ? 7 : rand(15);
        const mixed = rand(4);
        const neutral = rand(3);
        return { theme, positive, negative, mixed, neutral, answers: rand(6) === 0 ? 0 : positive + negative + mixed + neutral };
      });
      tallies.forEach((t) => { if (t.answers === 0) Object.assign(t, { positive: 0, negative: 0, mixed: 0, neutral: 0 }); });
      const read = 1 + rand(200);
      const sheet = {
        question: 'Q', about: '', themes: [], tallies,
        answers_received: read + rand(3) * rand(40), answers_read: read,
        answers_with_no_theme: rand(5), safety_reports: rand(4),
        overall_tone: { positive: rand(60), negative: rand(60), mixed: rand(9), neutral: rand(9) },
        by_group: rand(2) ? ['Team A', 'First-time', 'Year 2'].slice(0, 1 + rand(3)).map((group) => ({ group, answers: 3 + rand(50), themes: Object.fromEntries(tallies.map((t) => [t.theme, rand(3) === 0 ? 'fewer than 3' : rand(2) ? 0 : 3 + rand(20)])) })) : undefined,
      };
      const ids = sheetFacts(sheet).headline.map((f) => f.id);
      const picks = ids.filter(() => rand(2));
      expect(findUnsupported(fallbackReport(sheet, picks), sheet), JSON.stringify(sheet)).toEqual([]);
    }
  });
});

describe('checking any report text against the sheet', () => {
  it('flags the unsupported sentences the local model used to write', () => {
    const problems = findUnsupported(OLD_DEVICE_REPORT, SHEET);
    const flagged = (start) => problems.filter((p) => p.statement.startsWith(start)).map((p) => p.reason);
    expect(flagged('Food (8 answers)')).toEqual(['the sheet does not show Food leading on negative answers']);
    expect(flagged('Biggest Concerns')).toContain('the sheet does not show Content, Venue and Organization leading on mentions');
    expect(flagged('First Priority')).toContain('an interpretation that counts alone cannot support');
    expect(flagged('Follow-Up')).toContain('an interpretation that counts alone cannot support');
    // True statements in the same text are left alone.
    expect(flagged('What\'s Working Well: Networking (10 answers) received the most positive feedback.')).toEqual(['an interpretation that counts alone cannot support']);
    expect(new Set(problems.map((p) => p.statement)).size).toBe(5);
  });

  it('flags numbers that are not counts for the theme or group they sit with', () => {
    expect(findUnsupported('Venue: 15 answers.', SHEET)).toEqual([{ statement: 'Venue: 15 answers.', reason: '"15" is not in the sheet for Venue' }]);
    expect(findUnsupported('Food: 18 answers.', SHEET)[0].reason).toBe('"18" is not in the sheet for Food');
    expect(findUnsupported('About 28% of answers mention Organization.', SHEET)[0].reason).toBe('"28%" is not a count');
    expect(findUnsupported('In the "Returning" group (32 answers), Content came up most often, in 11.', SHEET)).toEqual([]);
    expect(findUnsupported('In the "Returning" group, Venue came up most often, in 5.', SHEET)[0].reason).toContain('does not show Venue leading');
    expect(findUnsupported('Venue: 14 answers (13 negative, 1 positive).\n64 answers were read.', SHEET)).toEqual([]);
  });

  it('flags comparisons it cannot check and rankings with no theme named', () => {
    expect(findUnsupported('Venue got twice as many complaints as Food.', SHEET)[0].reason).toBe('a comparison that cannot be checked against the sheet');
    expect(findUnsupported('One theme came up most often.', SHEET)[0].reason).toContain('any theme named here');
    expect(findUnsupported('Schedule had the most negative answers.', SHEET)).toHaveLength(1);
  });

  it('reads a withheld cell as the sheet wrote it for the group and theme named', () => {
    expect(findUnsupported('Returning attendees mentioned Content (11), Organization (7) and Networking (fewer than 3).', SHEET)).toEqual([]);
    expect(findUnsupported('In the "First-time" group, Content came up in fewer than 3 answers.', SHEET)).toEqual([]);
    for (const statement of [
      'In the "Returning" group, Content came up in fewer than 3 answers.', // that cell is 11
      'Networking came up in fewer than 3 answers.', // no group named
      'Returning attendees: Networking (fewer than 4).', // not the sheet's wording
      'Returning attendees mentioned Networking (fewer than 3), and fewer of them mentioned Venue.',
    ]) expect(findUnsupported(statement, SHEET)).toEqual([{ statement, reason: 'a comparison that cannot be checked against the sheet' }]);
  });

  it('accepts the safety follow-up the report prompt asks for, but no other advice', () => {
    expect(reportPrompt(SHEET)).toContain('the survey owner should read those answers personally and follow up');
    for (const statement of [
      'The survey owner should read those answers personally and follow up.',
      'The survey owner should read these answers personally and follow-up.',
      'Read all 3 answers personally and follow up.',
    ]) expect(findUnsupported(statement, SHEET)).toEqual([]);
    const advice = 'an interpretation that counts alone cannot support';
    for (const statement of [
      'The survey owner should read those answers personally and follow up, then fix the Venue first.',
      'The survey owner should read those answers personally and follow up with the speakers.',
      'The survey owner should follow up with the venue staff.',
    ]) expect(findUnsupported(statement, SHEET)).toEqual([{ statement, reason: advice }]);
    // Without safety reports the prompt asks for no follow-up, and numbers in it are still checked.
    expect(findUnsupported('The survey owner should read those answers personally and follow up.', { ...SHEET, safety_reports: 0 })[0].reason).toBe(advice);
    expect(findUnsupported('Read all 5 answers personally and follow up.', SHEET)[0].reason).toBe('"5" is not in the sheet');
  });

  it('checks how many themes or groups a statement says there are', () => {
    for (const statement of [
      'Respondents shared feedback across six main themes:',
      'Answers covered 6 themes.',
      'Respondents named six key themes, six distinct themes and six different themes.',
      'Answers came from two groups.',
      'Of the six themes, Organization came up most often.',
    ]) expect(findUnsupported(statement, SHEET)).toEqual([]);
    const statement = 'Respondents shared feedback across seven main themes:';
    expect(findUnsupported(statement, SHEET)).toEqual([{ statement, reason: 'the sheet has 6 themes, not seven' }]);
    expect(findUnsupported('5 themes came up.', SHEET)[0].reason).toBe('the sheet has 6 themes, not 5');
    expect(findUnsupported('Answers came from three groups.', SHEET)[0].reason).toBe('the sheet has 2 groups, not three');
    expect(findUnsupported('Answers came from two groups.', { ...SHEET, by_group: undefined })[0].reason).toBe('the sheet has no groups, not two');
    // Other uses of "main" are still comparisons, and number words are not read anywhere else.
    expect(findUnsupported('The main complaint was Food.', SHEET)[0].reason).toBe('a comparison that cannot be checked against the sheet');
    expect(findUnsupported('The main themes were Venue and Organization.', SHEET)[0].reason).toBe('a comparison that cannot be checked against the sheet');
    expect(findUnsupported('Post-event survey for a two-day developer conference.', SHEET)).toEqual([]);
  });

  it('flags only the advice in the cloud report of 2026-11-25', () => {
    const problems = findReportIssues(CLOUD_REPORT.report, CLOUD_REPORT.sheet);
    expect(problems).toHaveLength(1);
    expect(problems[0].statement).toMatch(/^Out of 64 answers received and 64 read, what specific adjustments should be prioritized .* Venue, Content, and Organization\?$/);
    expect(problems[0].reason).toBe('an interpretation that counts alone cannot support');
  });
});

describe('routing the report to the device', () => {
  it('gives the local model the pick schema, does not stream its JSON, and keeps the cloud prompt for the cloud', async () => {
    const sdk = fakeSdk({ cloud: () => { throw aiError('fetch-error', 403); }, deviceText: () => '{"picks":["3"]}' });
    const router = createRouter({ sdk, env: fakeEnv(), cloudModels: MODELS });
    const facts = sheetFacts(SHEET);
    const chunks = [];
    const out = await router.run('report', { prompt: 'cloud prompt', system: 'cloud system', devicePrompt: pickPrompt(SHEET, facts), deviceSystem: 'device system', deviceSchema: pickSchema(facts), deviceOnChunk: null, onChunk: (piece) => chunks.push(piece) });
    expect(out).toMatchObject({ source: 'on_device', fallback: { from: 'cloud', reason: 'blocked' } });
    expect(chunks).toEqual([]);
    const [cloudParams, deviceParams] = sdk.calls.params;
    expect(cloudParams.inCloudParams.generationConfig).toBeUndefined();
    expect(deviceParams.onDeviceParams.promptOptions.responseConstraint).toEqual(pickSchema(facts));
    expect(findUnsupported(fallbackReport(SHEET, parsePicks(out.text, facts)), SHEET)).toEqual([]);
  });
});

describe('names carried from an answer into a gist', () => {
  const answer = 'The volunteer at the info desk, Marisol, found my lost laptop charger. The Wi-Fi was fine on Friday. Dr. Halvorsen said so.';

  it('catches a capitalised word reused from the middle of a sentence', () => {
    expect(copiedName('A volunteer named Marisol found a lost charger.', answer)).toBe('Marisol');
    expect(copiedName('Marisol found a lost charger.', answer)).toBe('Marisol');
    expect(copiedName('The talk by Halvorsen was praised.', answer)).toBe('Halvorsen');
    expect(gistAllowed('Marisol found a lost charger.', answer)).toEqual({ ok: false, reason: 'The gist repeats a name from the answer ("Marisol").' });
  });

  it('leaves ordinary sentence openers, weekdays, Wi-Fi and theme names alone', () => {
    expect(copiedName('The Wi-Fi worked on Friday.', answer)).toBeNull();
    expect(copiedName('A volunteer returned a lost charger.', answer)).toBeNull();
    expect(copiedName('Feedback on the Venue was positive.', 'The Venue was lovely, said my colleague.', ['Venue'])).toBeNull();
    expect(gistAllowed('A volunteer returned a lost charger.', answer).ok).toBe(true);
  });

  it('cannot tell a name from an ordinary word when it only ever starts a sentence', () => {
    expect(copiedName('Jonas mispronounced names.', 'Jonas kept mispronouncing names.')).toBeNull();
  });
});
