// Statements that can be read straight off the tally sheet, and a checker that
// flags anything else. When the cloud cannot write the report, the page shows
// only these statements: the local model may choose which ones lead, but it
// does not write sentences of its own.

const TONES = ['negative', 'positive', 'mixed', 'neutral'];
const answers = (n) => `${n} ${n === 1 ? 'answer' : 'answers'}`;
const listOf = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const toneParts = (row) => TONES.filter((k) => row[k] > 0).map((k) => `${row[k]} ${k}`);

function leaders(rows, key) {
  const max = Math.max(0, ...rows.map((r) => r[key]));
  return max > 0 ? { value: max, rows: rows.filter((r) => r[key] === max) } : null;
}

const groupRows = (group) =>
  Object.entries(group.themes)
    .filter(([, n]) => typeof n === 'number')
    .map(([theme, n]) => ({ theme, answers: n }));

/** @returns {{headline: {id: string, text: string}[], counts: string[]}} */
export function sheetFacts(sheet) {
  const headline = [];
  const add = (id, text) => headline.push({ id, text });

  const safety = sheet.safety_reports;
  if (safety > 0) add('safety', `${answers(safety)} ${safety === 1 ? 'was marked as a safety report' : 'were marked as safety reports'}.`);

  const most = leaders(sheet.tallies, 'answers');
  if (most) add('most-mentioned', `${listOf(most.rows.map((r) => r.theme))} came up most often, in ${answers(most.value)}${most.rows.length > 1 ? ' each' : ''}.`);

  for (const tone of ['negative', 'positive']) {
    const lead = leaders(sheet.tallies, tone);
    if (!lead) continue;
    const share = lead.rows.length === 1 ? `${lead.value} of its ${lead.rows[0].answers}` : `${lead.value} each`;
    add(`most-${tone}`, `${listOf(lead.rows.map((r) => r.theme))} had the most ${tone} answers: ${share}.`);
  }

  const overall = toneParts(sheet.overall_tone);
  if (overall.length) add('tone', `Across the ${answers(sheet.answers_read)} read, the tone was ${listOf(overall)}.`);

  const none = sheet.answers_with_no_theme;
  if (none > 0) add('no-theme', `${answers(none)} ${none === 1 ? 'fits' : 'fit'} none of the themes.`);

  for (const group of sheet.by_group ?? []) {
    const lead = leaders(groupRows(group), 'answers');
    if (lead) add(`group:${group.group}`, `In the "${group.group}" group (${answers(group.answers)}), ${listOf(lead.rows.map((r) => r.theme))} came up most often, in ${lead.value}${lead.rows.length > 1 ? ' each' : ''}.`);
  }

  if (sheet.answers_read === sheet.answers_received) add('read', sheet.answers_received === 1 ? 'The one answer was read.' : `All ${answers(sheet.answers_received)} were read.`);
  else add('read', `${sheet.answers_read} of ${answers(sheet.answers_received)} have been read so far.`);

  const counts = [...sheet.tallies]
    .sort((a, b) => b.answers - a.answers)
    .map((row) => {
      const parts = toneParts(row);
      return `${row.theme}: ${answers(row.answers)}${parts.length ? ` (${parts.join(', ')})` : ''}.`;
    });
  return { headline, counts };
}

export const PICK_SYSTEM = 'You help the owner of a survey decide what to look at first. You answer with JSON only.';

export function pickPrompt(sheet, facts) {
  return `Survey question: "${sheet.question}"
These statements about the answers are all true:
${facts.headline.map((f, i) => `${i + 1}. ${f.text}`).join('\n')}
Choose the ${Math.min(4, facts.headline.length)} statements the survey owner most needs to see, most important first. Answer with their numbers.`;
}

export const pickSchema = (facts) => ({
  type: 'object',
  properties: { picks: { type: 'array', maxItems: facts.headline.length, items: { type: 'string', enum: facts.headline.map((_, i) => String(i + 1)) } } },
  required: ['picks'],
});

/** Turns the model's choice into fact ids. Anything it invents is ignored. */
export function parsePicks(text, facts) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  const ids = [];
  for (const pick of Array.isArray(raw?.picks) ? raw.picks : []) {
    const fact = /^\d+$/.test(String(pick)) ? facts.headline[Number(pick) - 1] : null;
    if (fact && !ids.includes(fact.id)) ids.push(fact.id);
  }
  return ids;
}

export const LEAD_MIN = 4;
export const LEAD_MAX = 5;

/** The report shown when no model may write one: chosen statements, then every count. */
export function fallbackReport(sheet, pickedIds = []) {
  const facts = sheetFacts(sheet);
  const byId = new Map(facts.headline.map((f) => [f.id, f.text]));
  const lead = [];
  const take = (id) => {
    if (byId.has(id) && !lead.includes(id) && lead.length < LEAD_MAX) lead.push(id);
  };
  take('safety'); // safety reports always come first; that is not the model's call
  (pickedIds ?? []).forEach(take);
  for (const fact of facts.headline) {
    if (lead.length >= Math.min(LEAD_MIN, facts.headline.length)) break;
    take(fact.id);
  }
  return ['## Summary of the counts', ...lead.map((id) => `- ${byId.get(id)}`), '', '## Counts by theme', ...facts.counts.map((line) => `- ${line}`)].join('\n');
}

// ---------- checking a text against the sheet ----------

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRx = (name, flags = 'iu') => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(name)}(?![\\p{L}\\p{N}])`, flags);

const RANK_CLAIMS = [
  ['answers', /came up (?:the )?most(?: often)?|most (?:often|frequently|commonly) mentioned|mentioned (?:the )?most|most[- ]mentioned|talked about (?:the )?most|most common/i],
  ['negative', /most negative/i],
  ['positive', /most positive/i],
];
const UNCHECKABLE = /\b(?:most|least|fewest|best|worst|biggest|largest|smallest|highest|lowest|top|main|primary|majority|minority|more|less|fewer|half|twice|double|second|third)\b/i;
const INTERPRETATION = /\b(?:should|must|needs? to|ought|recommend\w*|because|due to|caus\w+|suggest\w*|indicat\w+|likely|probably|concerns?|working well|going well|address\w*|improv\w+|fix\w*|requires?|follow[- ]up|priorit\w+)\b/i;

// "six main themes", "2 groups": how many themes or groups the sheet has. Number
// words are read only here.
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const HOW_MANY = new RegExp(`(?<![\\p{L}\\p{N}.])(\\d+|${NUMBER_WORDS.join('|')})\\s+(?:(?:main|key|distinct|different)\\s+)?(themes|groups)(?![\\p{L}\\p{N}])`, 'giu');
// What `reportPrompt` asks for under "Safety reports": the survey owner should
// read those answers personally and follow up. That advice is the prompt's.
const SAFETY_FOLLOW_UP = /(?:\b(?:should|must|needs? to)\s+)?(?:personally\s+)?\b(?:read|review)\s+(?:all\s+(?:of\s+)?)?(?:(?:those|these|the)\s+)?(?:\d+\s+)?(?:safety\s+)?(?:answers|reports|responses)(?:\s+personally)?\s+and\s+follow[- ]?up(?:\s+on\s+them)?(?=\s*(?:[.!?;:,)]|$))/gi;

/**
 * Lists the statements in `text` that the tally sheet does not support: a
 * number that is not a count for the theme or group named with it, a ranking
 * the counts do not show, a wrong number of themes or groups, a comparison that
 * cannot be checked, or advice and explanation, which counts alone cannot
 * justify. The safety follow-up that the report prompt asks for is not advice.
 * @returns {{statement: string, reason: string}[]}
 */
export function findUnsupported(text, sheet) {
  const problems = [];
  const themes = sheet.tallies;
  const groups = sheet.by_group ?? [];
  const everywhere = new Set([sheet.answers_received, sheet.answers_read, sheet.answers_with_no_theme, sheet.safety_reports, ...Object.values(sheet.overall_tone)]);
  const statements = String(text)
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|#{1,6})\s*/, '').trim())
    .filter(Boolean)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/));

  for (const statement of statements) {
    const named = themes.filter((t) => nameRx(t.theme).test(statement));
    const inGroups = groups.filter((g) => nameRx(g.group).test(statement));
    const why = (reason) => problems.push({ statement, reason });

    let rest = statement;
    for (const name of [...named.map((t) => t.theme), ...inGroups.map((g) => g.group)]) rest = rest.replace(nameRx(name, 'giu'), ' ');

    // A withheld cell, quoted for a group and theme the statement names, is the
    // sheet's own wording ("fewer than 3"), not a comparison.
    for (const g of inGroups) {
      for (const t of named) {
        const cell = g.themes[t.theme];
        if (typeof cell === 'string' && /^fewer than \d+$/.test(cell)) rest = rest.replace(nameRx(cell, 'giu'), ' ');
      }
    }
    rest = rest.replace(HOW_MANY, (_, said, kind) => {
      const stated = /^\d+$/.test(said) ? Number(said) : NUMBER_WORDS.indexOf(said.toLowerCase()) + 1;
      const noun = kind.toLowerCase();
      const actual = noun === 'themes' ? themes.length : groups.length;
      if (stated !== actual) why(`the sheet has ${actual || 'no'} ${actual === 1 ? noun.slice(0, -1) : noun}, not ${said.toLowerCase()}`);
      return ' ';
    });

    const allowed = new Set(everywhere);
    for (const t of named) for (const key of ['answers', ...TONES]) allowed.add(t[key]);
    for (const g of inGroups) {
      allowed.add(g.answers);
      for (const row of groupRows(g)) allowed.add(row.answers);
    }
    for (const figure of rest.match(/\d+(?:\.\d+)?%?/g) ?? []) {
      if (/[.%]/.test(figure)) why(`"${figure}" is not a count`);
      else if (!allowed.has(Number(figure))) why(`"${figure}" is not in the sheet${named.length ? ` for ${listOf(named.map((t) => t.theme))}` : ''}`);
    }

    for (const [key, pattern] of RANK_CLAIMS) {
      if (!pattern.test(rest)) continue;
      rest = rest.replace(pattern, ' ');
      let lead = null;
      if (inGroups.length === 0) lead = leaders(themes, key);
      else if (inGroups.length === 1 && key === 'answers') lead = leaders(groupRows(inGroups[0]), key);
      const leading = new Set((lead?.rows ?? []).map((r) => r.theme));
      if (named.length === 0 || !named.every((t) => leading.has(t.theme))) {
        why(`the sheet does not show ${named.length ? listOf(named.map((t) => t.theme)) : 'any theme named here'} leading on ${key === 'answers' ? 'mentions' : `${key} answers`}`);
      }
    }
    if (UNCHECKABLE.test(rest)) why('a comparison that cannot be checked against the sheet');
    if (sheet.safety_reports > 0) rest = rest.replace(SAFETY_FOLLOW_UP, ' ');
    if (INTERPRETATION.test(rest)) why('an interpretation that counts alone cannot support');
  }
  return problems;
}
