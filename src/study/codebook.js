// Themes: the analyst's own categories. Names and definitions are written by
// the analyst and are part of what the cloud is told.

export const MAX_THEMES = 12;

export function themeId(name) {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
      .slice(0, 32) || 'THEME'
  );
}

export function normalizeThemes(list) {
  const seen = new Set();
  const themes = [];
  for (const item of list ?? []) {
    const name = String(item?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) continue;
    let id = themeId(name);
    for (let n = 2; seen.has(id); n += 1) id = `${themeId(name)}_${n}`;
    seen.add(id);
    themes.push({ id, name, definition: String(item?.definition ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) });
    if (themes.length === MAX_THEMES) break;
  }
  return themes;
}

export const THEME_LIST_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: { name: { type: 'string', maxLength: 40 }, definition: { type: 'string', maxLength: 200 } },
        required: ['name', 'definition'],
      },
    },
  },
  required: ['themes'],
};

export function parseThemeList(text) {
  try {
    const parsed = JSON.parse(text);
    return normalizeThemes(Array.isArray(parsed?.themes) ? parsed.themes : []);
  } catch {
    return [];
  }
}

export function suggestPrompt({ question, context }) {
  return `Survey question: "${question}"
${context ? `About the survey: ${context}\n` : ''}Propose 5 to 7 themes that answers to this question usually fall into, so an analyst can sort the answers.
Each theme needs a short name of one to three words and a one-sentence definition. Themes must not overlap.`;
}

export function discoverPrompt({ question, sample }) {
  return `Survey question: "${question}"
Here are ${sample.length} of the answers:
${sample.map((text, i) => `${i + 1}. ${text}`).join('\n')}

Propose 4 to 7 themes that would let an analyst sort answers like these.
Each theme needs a short name of one to three words and a one-sentence definition. Do not mention any person, team or place by name.`;
}

export const THEME_SYSTEM = 'You help an analyst set up categories for open-ended survey answers. You answer with JSON only.';

/** Evenly spaced picks, so the same study always shows the model the same sample. */
export function sampleAnswers(answers, size = 12, maxChars = 320) {
  if (answers.length <= size) return answers.map((a) => a.text.slice(0, maxChars));
  const step = answers.length / size;
  return Array.from({ length: size }, (_, i) => answers[Math.floor(i * step)].text.slice(0, maxChars));
}
