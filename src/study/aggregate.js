// Counts. Apart from gists the analyst approves, this is the only form in which
// answers contribute to the tally sheet sent for the report.

export const SENTIMENTS = ['positive', 'negative', 'mixed', 'neutral'];
export const SMALL_CELL = 3; // counts below this are not reported per group

const emptyTone = () => ({ positive: 0, negative: 0, mixed: 0, neutral: 0 });
export const isRead = (answer) => Boolean(answer.reading && !answer.reading.failed);

export function tally(study) {
  const read = study.answers.filter(isRead);
  const themes = study.themes.map((t) => ({ id: t.id, name: t.name, count: 0, ...emptyTone() }));
  const byId = new Map(themes.map((t) => [t.id, t]));
  const tone = emptyTone();
  let noTheme = 0;
  let safetyReports = 0;
  for (const answer of read) {
    const r = answer.reading;
    tone[r.sentiment] += 1;
    if (r.flag) safetyReports += 1;
    const known = r.themes.filter((id) => byId.has(id));
    if (known.length === 0) noTheme += 1;
    for (const id of known) {
      const t = byId.get(id);
      t.count += 1;
      t[r.sentiment] += 1;
    }
  }
  return { answers: study.answers.length, read: read.length, themes, noTheme, safetyReports, tone, groups: groupTable(study, read) };
}

/** Theme counts per group, with small groups merged and small cells withheld. */
export function groupTable(study, read) {
  const names = [...new Set(read.map((a) => a.group).filter(Boolean))];
  if (names.length < 2) return [];
  const rows = new Map();
  const rowFor = (name) => {
    if (!rows.has(name)) rows.set(name, { name, answers: 0, themes: Object.fromEntries(study.themes.map((t) => [t.id, 0])) });
    return rows.get(name);
  };
  const sizes = new Map();
  for (const a of read) sizes.set(a.group || '', (sizes.get(a.group || '') ?? 0) + 1);
  for (const a of read) {
    const tooSmall = !a.group || sizes.get(a.group) < SMALL_CELL;
    const row = rowFor(tooSmall ? 'Other or not given' : a.group);
    row.answers += 1;
    for (const id of a.reading.themes) if (id in row.themes) row.themes[id] += 1;
  }
  const nameOf = new Map(study.themes.map((t) => [t.id, t.name]));
  return [...rows.values()]
    .filter((row) => row.answers >= SMALL_CELL)
    .map((row) => ({
      group: row.name,
      answers: row.answers,
      themes: Object.fromEntries(
        Object.entries(row.themes).map(([id, n]) => [nameOf.get(id), n > 0 && n < SMALL_CELL ? `fewer than ${SMALL_CELL}` : n]),
      ),
    }));
}
