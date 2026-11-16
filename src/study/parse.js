// Turns pasted text or a dropped file into a list of answers.

export const MAX_ANSWERS = 2000;
export const MAX_ANSWER_CHARS = 1800; // leaves room for the instructions inside the local model's context

export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', '\t', ';'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** A table is something with a header row and at least two columns on most lines. */
export function looksLikeTable(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return false;
  const delimiter = detectDelimiter(text);
  const header = parseCsv(lines[0], delimiter)[0] ?? [];
  // Column names are short and are not sentences.
  const isColumnName = (cell) => {
    const name = cell.trim();
    return name !== '' && name.length <= 40 && name.split(/\s+/).length <= 4 && !/[.!?]$/.test(name);
  };
  if (header.length < 2 || !header.every(isColumnName)) return false;
  const rows = parseCsv(text, delimiter);
  if (rows.length < 3) return false;
  const sameWidth = rows.filter((r) => r.length === header.length).length;
  return sameWidth >= rows.length * 0.8;
}

export function guessAnswerColumn(rows) {
  const [header, ...body] = rows;
  let best = 0;
  let bestLength = -1;
  header.forEach((_, col) => {
    const average = body.reduce((sum, r) => sum + (r[col]?.trim().length ?? 0), 0) / Math.max(1, body.length);
    if (average > bestLength) {
      bestLength = average;
      best = col;
    }
  });
  return best;
}

/** A group column is short text with few distinct values, such as "Role" or "Team". */
export function guessGroupColumn(rows, answerColumn) {
  const [header, ...body] = rows;
  let best = -1;
  header.forEach((_, col) => {
    if (col === answerColumn || best !== -1) return;
    const values = body.map((r) => r[col]?.trim() ?? '').filter(Boolean);
    const distinct = new Set(values);
    if (values.length >= body.length * 0.8 && distinct.size >= 2 && distinct.size <= 8 && distinct.size < values.length / 2) best = col;
  });
  return best;
}

export function toAnswers(texts, groups = []) {
  const answers = [];
  texts.forEach((raw, index) => {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text || answers.length >= MAX_ANSWERS) return;
    answers.push({
      id: `a${answers.length + 1}`,
      text: text.slice(0, MAX_ANSWER_CHARS),
      group: String(groups[index] ?? '').trim(),
      reading: null,
      shareGist: false,
    });
  });
  return answers;
}

export function parseInput(text) {
  if (looksLikeTable(text)) {
    const rows = parseCsv(text);
    const answerColumn = guessAnswerColumn(rows);
    const groupColumn = guessGroupColumn(rows, answerColumn);
    const body = rows.slice(1);
    return {
      kind: 'table',
      answerColumn: rows[0][answerColumn].trim(),
      groupColumn: groupColumn === -1 ? null : rows[0][groupColumn].trim(),
      answers: toAnswers(
        body.map((r) => r[answerColumn]),
        groupColumn === -1 ? [] : body.map((r) => r[groupColumn]),
      ),
    };
  }
  return { kind: 'lines', answerColumn: null, groupColumn: null, answers: toAnswers(text.split(/\r?\n/)) };
}
