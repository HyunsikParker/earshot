// Tally marks: four uprights and a diagonal for every five. The counts go to
// the cloud in the tally sheet, so they are drawn the way a person counting
// slips by hand would draw them.
import { esc } from './dom.js';

const UPRIGHTS = [
  [4.6, 3.2, 3.6, 20.8],
  [9.8, 3.0, 10.4, 21.0],
  [16.4, 3.4, 15.6, 20.6],
  [21.6, 3.1, 22.2, 20.9],
];

function gate(strokes, drawLast) {
  let paths = '';
  for (let i = 0; i < Math.min(strokes, 4); i += 1) {
    const [x1, y1, x2, y2] = UPRIGHTS[i];
    paths += `<path${drawLast && i === strokes - 1 ? ' class="is-new"' : ''} d="M${x1} ${y1}L${x2} ${y2}"/>`;
  }
  if (strokes === 5) paths += `<path${drawLast ? ' class="is-new"' : ''} d="M1.4 17.2L24.8 6.4"/>`;
  return `<svg class="tally__gate" viewBox="0 0 26 24" width="26" height="24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/**
 * @param {number} count
 * @param {{label?: string, animate?: boolean, max?: number}} [options]
 */
export function tallyMarks(count, { label = '', animate = false, max = 75 } = {}) {
  const shown = Math.min(count, max);
  const gates = Math.ceil(shown / 5);
  let svg = '';
  for (let g = 0; g < gates; g += 1) {
    const strokes = Math.min(5, shown - g * 5);
    svg += gate(strokes, animate && g === gates - 1);
  }
  const more = count > max ? `<span class="tally__more">and ${count - max} more</span>` : '';
  return `<span class="tally" role="img" aria-label="${esc(label ? `${label}: ${count}` : String(count))}">${svg}${more}</span>`;
}
