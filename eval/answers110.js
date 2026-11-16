// 110 synthetic answers with labels, written before the measurement run.
// Nobody and nothing named here exists.
//
// How a run is scored (fixed before running):
// - Themes, micro-averaged over every (answer, theme) decision.
//     must: themes the answer is clearly about. Missing one is a false negative.
//     may:  themes a careful reader could also accept. Predicting one is neither
//           rewarded nor penalised in the main score.
//     Main score ("lenient"): TP = predicted ∩ must, FP = predicted − must − may, FN = must − predicted.
//     Lower bound ("strict"): every predicted theme outside must counts as a false positive.
//   The project's drop condition (micro-F1 below 0.75) is applied to the lenient score.
// - Tone: correct when the predicted tone is in the accepted list. null = not scored.
// - Safety flag: true when the answer reports harassment, discrimination or feeling unsafe. null = not scored (borderline).
// - ids: details that must not appear in the gist. A gist that keeps one is a leak. A leak the
//   guard (gistAllowed) lets through is an unblocked leak, which the drop condition does not tolerate.
import { sampleStudy } from '../src/sample/conference.js';

const THEME = { S: 'SCHEDULE', C: 'CONTENT', V: 'VENUE', F: 'FOOD', N: 'NETWORKING', O: 'ORGANIZATION' };
const TONE = { p: 'positive', n: 'negative', m: 'mixed', u: 'neutral' };
const themes = (letters) => [...letters].map((l) => THEME[l]);
const tones = (letters) => (letters === null ? null : [...letters].map((l) => TONE[l]));

// Labels for the 64 answers of the sample study, in order: must, may, tone, flag, ids.
const SAMPLE_LABELS = [
  ['V', '', 'n', 0], ['C', '', 'm', 0], ['S', '', 'n', 0], ['F', '', 'n', 0], ['O', '', 'n', 0], ['N', '', 'p', 0], ['V', '', 'n', 0],
  ['', 'OC', 'n', 1, ['dana.k@example.com', 'dana']], ['S', 'V', 'n', 0], ['C', '', 'p', 0], ['O', '', 'n', 0], ['F', 'NV', 'pm', 0],
  ['S', '', 'n', 0], ['C', '', 'n', 0], ['V', 'O', 'p', 0], ['', 'NOV', 'n', 1], ['', '', 'pu', 0], ['O', 'C', 'nu', 0], ['N', '', 'num', 0],
  ['C', '', 'n', 0], ['S', 'CO', 'num', 0], ['O', '', 'p', 0], ['C', 'S', 'p', 0], ['C', 'S', 'n', 0], ['F', 'VO', 'n', 0],
  ['V', 'O', 'nm', null], ['N', 'VF', 'nu', 0], ['S', 'C', 'n', 0], ['', 'OCV', 'p', 0], ['S', '', 'nu', 0], ['C', '', 'n', 0],
  ['V', '', 'n', 0], ['O', '', 'p', 0, ['Marisol']], ['F', 'OV', 'num', 0], ['N', 'O', 'p', 0], ['O', '', 'n', 0], ['OV', '', 'n', 0],
  ['S', 'C', 'p', 0], ['', 'NO', 'n', 1], ['F', '', 'p', 0], ['V', '', 'n', 0], ['O', '', 'p', 0], ['V', '', 'nu', 0],
  ['V', 'SOC', 'num', 0], ['', 'O', 'n', 0], ['O', '', 'n', 0], ['C', '', 'n', 0], ['N', 'CS', 'p', 0], ['F', 'SO', 'n', 0],
  ['V', 'C', 'n', 0], ['', 'O', 'p', 0], ['C', '', 'n', 0], ['O', 'V', 'n', 0], ['C', 'O', 'nu', 0], ['F', '', 'p', 0],
  ['N', 'S', 'mp', 0], ['', '', 'p', 0], ['O', 'V', 'n', 0], ['N', 'F', 'num', 0], ['S', 'C', 'n', 0], ['C', '', 'p', 0],
  ['O', 'C', 'n', 0, ['Tomasz']], ['V', '', 'n', 0], ['S', '', 'mpn', 0],
];

// 46 more answers: text, must, may, tone, flag, ids.
const MORE = [
  ['Our team lead, Priyanka Nair, asked for a group discount three times by email and never heard back.', 'O', '', 'n', 0, ['Priyanka', 'Nair']],
  ['The keynote by Dr. Halvorsen ran twenty minutes over and pushed lunch back.', 'S', 'CF', 'n', 0, ['Halvorsen']],
  ['Call me on 415-555-0137 if you want details: the fire exit on level 2 was blocked by boxes all Friday.', 'V', 'O', 'n', null, ['415-555-0137']],
  ['The vegetarian line was longer than the main one both days.', 'F', '', 'n', 0],
  ["More talks like Amara Okoye's on accessibility testing. I took four pages of notes.", 'C', '', 'p', 0, ['Amara', 'Okoye']],
  ['The speaker dinner invite went to my old address, kofi.mensah@oldmail.example, so I missed it.', 'O', 'NF', 'n', 0, ['kofi.mensah@oldmail.example', 'kofi', 'mensah']],
  ['Nowhere to charge a laptop in the workshop rooms.', 'V', '', 'n', 0],
  ["I'm @lena_codes on the event chat. Two people there kept posting comments about my body after my talk and no moderator stepped in.", '', 'ON', 'n', 1, ['@lena_codes', 'lena_codes', 'lena']],
  ["Please keep Coach Dmitri's morning yoga session, it was a lovely way to meet people before the talks.", 'N', 'S', 'p', 0, ['Dmitri']],
  ['The shuttle from the hotel left at 7:40 sharp even though the schedule said 8.', 'O', 'SV', 'n', 0],
  ['Three sessions on state management in one afternoon was too many.', 'C', 'S', 'n', 0],
  ['My colleague Arjun from Northwind Labs was refused entry on day two because his badge had the wrong name.', 'O', '', 'n', 0, ['Arjun', 'Northwind']],
  ["Loved the stickers. That's it, that's the feedback.", '', 'O', 'p', 0],
  ['The main hall screen was washed out by sunlight until someone closed the blinds at noon.', 'V', '', 'n', 0],
  ["Thirty minutes between sessions is perfect. Don't shorten it.", 'S', '', 'p', 0],
  ["The job board felt like an ad wall. Half the 'attendees' at the mixer were recruiters.", 'N', 'O', 'n', 0],
  ['I waited 25 minutes for coffee on Friday morning, and the barista, Sam, was working alone.', 'F', 'O', 'n', 0, ['Sam']],
  ["A volunteer told me the prayer room 'wasn't for people like me' and sent me away. I'd rather not give my name but you can reach me at 020 7946 0991.", '', 'OV', 'n', 1, ['020 7946 0991', '7946']],
  ['Workshop materials arrived by email the night before. Send them a week ahead.', 'O', 'C', 'nu', 0],
  ['The closing party at the Lighthouse Bar was too loud to talk.', 'N', 'V', 'n', 0, ['Lighthouse']],
  ['Seats in the front rows were all reserved for sponsors.', '', 'VO', 'n', 0],
  ['Could talks be tagged by level in the app? I walked out of two that were too basic.', 'C', 'O', 'nu', 0],
  ['Fine overall.', '', '', 'up', 0],
  ['The Saturday hack session should start after lunch, not at 9am after the party.', 'S', '', 'nu', 0],
  ['Rafael from the framework team was the only mentor I wanted to meet, and sign-up filled in ten minutes.', 'N', 'O', 'n', 0, ['Rafael']],
  ["Bao buns at the Friday lunch were the best conference food I've had.", 'F', '', 'p', 0],
  ['Stairs only to the mezzanine stage. My colleague on crutches watched the stream from the lobby.', 'V', '', 'n', null],
  ["Jonas, the MC, kept mispronouncing speakers' names and making it a joke. It got uncomfortable.", '', 'OC', 'n', null, ['Jonas']],
  ['Two tracks is enough. With four I felt I was always missing something.', 'S', 'C', 'nu', 0],
  ['Registration email said doors at 9, the website said 8:30.', 'O', '', 'n', 0],
  ['The quiet room was a great addition.', 'V', '', 'p', 0],
  ['More women on stage this year, and it showed in the questions people asked. Thank you.', 'C', '', 'p', 0],
  ["Bring back the board-game night. It's the only social where I don't have to shout.", 'N', '', null, 0],
  ["Lanyards with first names only, please. A man I didn't know followed me to my hotel after reading my full name and company off my badge.", '', 'O', 'n', 1],
  ['The on-site espresso cart took cards only and the reader was down half the time.', 'F', 'O', 'n', 0],
  ['Nothing to add.', '', '', 'up', 0],
  ['Session rooms were a ten-minute walk apart across a car park in the rain.', 'V', 'S', 'n', 0],
  ['I learned more in the hallway than in the talks, which says something about both.', 'N', 'C', null, 0],
  ['Please publish the schedule earlier. I booked travel before I knew which day my workshop was on.', 'O', 'S', 'nu', 0],
  ['Day two lunch ran out before the last session let out.', 'F', 'S', 'n', 0],
  ['My manager, Ingrid Solberg, wants to know why the invoice lists a different company name. Please write to her at billing@fjordworks.example.', 'O', '', 'nu', 0, ['Ingrid', 'Solberg', 'billing@fjordworks.example', 'fjordworks']],
  ["The live demo failures in Mei Tanaka's afternoon session were painful to watch. Rehearse them.", 'C', '', 'n', 0, ['Mei', 'Tanaka']],
  ['Great venue, terrible acoustics.', 'V', '', 'mn', 0],
  ["The beginners' meetup on day one made the rest of the conference less scary.", 'N', '', 'p', 0],
  ['Someone was filming the audience during the diversity panel without asking, and when I objected he said to relax. I did not feel safe speaking after that.', '', 'OC', 'n', 1],
  ['Wonderful event. See you next year.', '', '', 'p', 0],
];

const sample = sampleStudy();
export const STUDY = { question: sample.question, context: sample.context, themes: sample.themes };

const entry = (text, [must, may, tone, flag, ids = []]) => ({ text, must: themes(must), may: themes(may), tone: tones(tone), flag: flag === null ? null : Boolean(flag), ids });

export const ITEMS = [
  ...sample.answers.map((a, i) => entry(a.text, SAMPLE_LABELS[i])),
  ...MORE.map(([text, ...labels]) => entry(text, labels)),
];
