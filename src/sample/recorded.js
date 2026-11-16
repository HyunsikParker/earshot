// Labels from one on-device run of the sample study: Gemini Nano in Chrome 157
// on an Apple M4 Mac, 15 November 2026 (first run of eval/read110.js). They are
// shown only when a browser has no local model, and the page says they are
// recorded. They are kept exactly as the model produced them, mistakes included.
// Each row: theme positions | tone | safety flag | gist.

export const RECORDED_ON = '15 November 2026';

const THEME_IDS = ['SCHEDULE', 'CONTENT', 'VENUE', 'FOOD', 'NETWORKING', 'ORGANIZATION'];
const TONE = { p: 'positive', n: 'negative', m: 'mixed', u: 'neutral' };

const ROWS = `2|n|0|Wi-Fi connectivity issues impacted the conference experience for attendees.
1|u|0|A particular track had repetitive content for a specific audience level.
0|n|0|Session scheduling should avoid conflicts for popular talks.
3|n|0|Catering options were limited, and coffee availability was poor.
5|n|0|The registration process was slow and poorly communicated.
4|p|0|The attendee enjoyed a successful networking opportunity at the conference.
2|n|0|Attendee found the room temperature uncomfortable and chairs painful.
|n|1|An attendee experienced disrespectful behavior during a Q&A session.
0|n|0|Short breaks hindered attendance at afternoon sessions due to travel time.
1|p|0|The conference offered a good selection of informative talks and topics.
5|n|0|The conference app's lack of real-time room updates caused confusion.
34|p|0|The food was appreciated, and more seating would improve networking opportunities.
0|n|0|The long duration of the first day negatively impacted attendee concentration.
1|n|0|The workshops lacked substantial practical coding exercises for their cost.
2|p|0|The conference venue was accessible and well-marked, which was appreciated.
5|n|1|Attendee felt insecure due to lack of safety provisions for travel.
5|p|0|The respondent indicates satisfaction with the conference's current format.
5|u|0|The commenter requests slides and notes a communication breakdown.
4|n|0|Attendees feeling isolated seek more structured networking opportunities.
1|n|0|Attendees desire fresh perspectives and new speakers at the conference.
1|n|0|Attendees missed out on valuable content due to scheduling conflicts.
5|p|0|Badge pickup process was quick and efficient for attendees.
01|p|0|Short talks helped keep sessions focused and concise for attendees.
1|n|0|The prominence of sponsor content impacted the conference's value.
3|n|0|Water availability was poor, impacting attendee hydration throughout the conference.
2|n|1|Accessibility issues impacted participation and caused missed sessions.
42|n|0|Attendees need more space to comfortably network and socialize during breaks.
0|n|0|Q&A sessions extended beyond scheduled break times, impacting break duration.
5|p|0|Appreciated the live captions during the conference; continued investment is suggested.
0|n|0|A later start time could improve attendance at key sessions.
1|n|0|The conference lacked intermediate-level content, focusing on introductory or academic topics.
2|n|0|Audio bleed disrupted the ability to follow presentations clearly.
5|p|0|Helpful staff improved the attendee experience significantly.
3|n|0|Food options near the venue were not affordable for attendees.
4|p|0|The conference facilitated valuable connections and career opportunities.
5|n|0|The conference app wasn't adequate for everyone's scheduling needs.
52|n|0|Attendee found issues with the conference app and outlet availability.
0|p|0|The shorter talk length was appreciated and should continue.
4|n|1|An attendee experienced unwanted physical contact and lacked adequate resolution.
3|p|0|The clear labeling of gluten-free meals was a positive experience.
2|n|0|Temperature issues were experienced in different parts of the conference venue.
5|p|0|The conference organizers demonstrated a commitment to a respectful environment.
2|n|0|The conference was noisy, and attendees desired a quiet space.
01|n|0|On-device models talks were overcrowded, and people couldn't attend.
5|n|0|The attendee expresses dissatisfaction with the conference ticket value.
5|n|0|Billing inquiries are not being addressed by conference organizers.
1|n|0|The panel lacked diverse perspectives, leading to a lack of insightful discussion.
4|p|0|The unconference provided excellent opportunities for connection and discussion.
30|n|0|The wait for lunch significantly impacted session attendance and flow.
21|n|0|Attendee found readability issues with presentation slides during the conference.
4|p|0|Support for childcare enabled participation in the conference events.
1|n|0|The keynote lacked originality compared to previous presentations.
52|n|0|Lack of clear directions caused confusion and wasted attendee time.
1|n|0|Clarifying talk levels would improve the user experience at the conference.
3|p|0|The availability of coffee was a positive aspect of the conference.
40|m|0|The networking session timing could be improved for better flow.
|p|0|The conference was perceived as excellent, exceeding expectations.
52|n|0|Connectivity issues arising during the conference caused inconvenience for attendees.
4|n|0|The exclusive focus on alcohol limits social interaction for many attendees.
01|n|0|The length of hands-on labs was insufficient for completion.
1|p|0|Attendees appreciated talks from less mainstream organizations.
5|n|0|Attendee had trouble obtaining session recordings after requesting them.
2|n|0|Workshop room setup was inadequate, impacting attendee comfort during the event.
0|n|0|The early workshop start time was unwelcome for some attendees.`.split('\n');

/** True when `study` is the untouched sample these labels were recorded for. */
export function matchesRecorded(study) {
  return Boolean(study?.sample) && study.answers.length === ROWS.length && study.themes.map((t) => t.id).join() === THEME_IDS.join();
}

export function recordedReadings() {
  return ROWS.map((row) => {
    const [positions, tone, flag, ...gist] = row.split('|');
    return { themes: [...positions].map((p) => THEME_IDS[Number(p)]), sentiment: TONE[tone], flag: flag === '1', gist: gist.join('|'), source: 'recorded', ms: 0, edited: false };
  });
}
