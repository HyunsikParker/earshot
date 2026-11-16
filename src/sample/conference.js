// Sample study. Every answer below was written for this sample. The
// conference, the people and the email address do not exist.
import { toAnswers } from '../study/parse.js';
import { normalizeThemes } from '../study/codebook.js';
import { newStudy } from '../store.js';

const F = 'First-time';
const R = 'Returning';

const ANSWERS = [
  [F, 'The Wi-Fi dropped every time more than fifty people were in the main hall. Hard to follow the live coding.'],
  [R, 'Loved the deep-dive on offline sync, but the beginner track repeated the same intro three times.'],
  [R, 'Two talks I wanted were scheduled at the same time. Please stagger the popular ones.'],
  [F, 'No vegan option at lunch on day two, and the coffee ran out by 10.'],
  [F, 'Registration line took 40 minutes and nobody told us there was a second desk.'],
  [F, "The evening meetup was the best part. I met two people I'm now building something with."],
  [R, 'Rooms were freezing and the chairs were painful after an hour.'],
  [F, "A speaker made a joke about my accent during Q&A and a staff member laughed. I'd like someone to contact me about this: dana.k@example.com."],
  [R, 'Breaks were too short to get between buildings, so I missed the start of every afternoon session.'],
  [R, 'Great mix of topics this year. The keynote on local-first apps was worth the trip alone.'],
  [F, 'The conference app never showed room changes. I only found out from a paper sign.'],
  [R, 'Lunch was excellent, especially the noodle bar. More places to sit and eat with others would help people mix.'],
  [F, 'Day one ran from 8 to 7. By the last session nobody could concentrate.'],
  [R, 'Workshops were too shallow for the price. I wanted real code, not slides.'],
  [F, 'The venue was easy to reach by train and the step-free entrance was clearly marked. Thank you.'],
  [F, 'I felt unsafe walking to the after-party venue alone at night. There was no shuttle and no one to ask.'],
  [R, 'Nothing to change. Same again please.'],
  [R, 'Please send the slides. Emails from the organisers stopped after the event.'],
  [F, 'More structured networking for people who came alone. The hallway is intimidating.'],
  [R, 'The speaker lineup felt like the same five people as last year. Bring in new voices.'],
  [R, 'Please record the workshops. I had to pick between two and the one I skipped is all anyone talked about.'],
  [R, 'Badge pickup was smooth this year, in and out in two minutes.'],
  [F, 'The lightning talks were the highlight. Ten minutes forces people to get to the point.'],
  [R, 'Too much sponsor content in the main track. The 2pm slot on Thursday was a product pitch.'],
  [F, 'Water stations were empty by mid-afternoon both days.'],
  [F, 'I use a wheelchair and the only lift to the workshop floor was out of order on Friday. Staff were kind but I missed two sessions.'],
  [F, 'Could the hallway have more tables? Hard to talk to anyone while standing in a queue for coffee.'],
  [R, 'Speaker Q&A always ran over and ate the break.'],
  [F, 'The live captions on the main stage were excellent. Keep paying for those.'],
  [R, 'Start later on day two. Half the room was missing for the 8:30 keynote after the party.'],
  [R, 'More intermediate content. Everything was either hello-world or a research paper.'],
  [F, 'Sound bled through the divider between rooms B and C. I could hear both talks and follow neither.'],
  [F, 'The volunteer at the info desk, Marisol, found my lost laptop charger within ten minutes. Thank her for me.'],
  [F, 'Dinner on your own in that neighbourhood was expensive. A list of cheap places nearby would help.'],
  [F, 'I came alone and left with a job interview. The find-a-teammate board was a great idea.'],
  [R, 'Printed schedules ran out. Not everyone wants to stare at the app.'],
  [F, 'The app drained my battery and there were not enough outlets in the hall.'],
  [R, 'Great that talks were kept to 25 minutes. Please never go back to 50.'],
  [F, 'A man at the Thursday social kept touching my arm after I asked him to stop. I told a volunteer and nothing happened.'],
  [R, "Gluten-free meals were labelled clearly, thank you. First conference where I didn't have to ask."],
  [R, 'Too cold in the main hall, too hot in the workshop rooms.'],
  [F, 'The code of conduct was read out at the opening. That made me feel the organisers meant it.'],
  [F, 'I wish there had been a quiet room. Two days of noise is a lot.'],
  [R, 'Talks about on-device models were packed and people were turned away. Use the big room for those next year.'],
  [R, "Ticket price went up but the swag got worse. I'd rather have neither and pay less."],
  [R, 'My manager needs an invoice with our tax number and nobody answers the billing email.'],
  [R, 'The panel on hiring was five people agreeing with each other.'],
  [F, 'Loved the unconference afternoon. Best conversations of the week happened there.'],
  [F, 'Lunch queue was 35 minutes on day one. By the time I ate, the next session had started.'],
  [R, 'Slides were unreadable from the back half of room A. Bigger screens, or tell speakers to use bigger type.'],
  [F, 'Childcare made it possible for me to come at all. Please keep it.'],
  [R, 'The closing keynote was the same talk the speaker gave online last spring.'],
  [F, 'Signage from the train station was nonexistent. I walked around the block twice.'],
  [F, 'It would help to know the level of each talk in advance. "Advanced" meant very different things.'],
  [R, 'Coffee was good and there was plenty of it. That matters more than you think.'],
  [F, 'The speed-networking round was awkward but it worked. Do it on the first morning instead of the last.'],
  [R, 'Nothing. Best one yet.'],
  [R, 'Wi-Fi password changed halfway through day one and nobody announced it.'],
  [F, 'Evening events all centred on alcohol. An option without a bar would include more of us.'],
  [F, 'The hands-on labs needed twice the time. We had just got the environment running when it ended.'],
  [R, 'Speakers from outside the usual big companies were refreshing. More of that.'],
  [R, 'I asked twice for the session recordings and got no reply. My email is in the registration list under Tomasz W.'],
  [F, 'Chairs in the workshop rooms had no tables, so laptops were on knees for two hours.'],
  [R, 'Loved everything except the 7am start for the workshop track.'],
];

const THEMES = [
  { name: 'Schedule', definition: 'Timing of sessions, overlaps between talks, length of breaks, length of the day.' },
  { name: 'Content', definition: 'Quality, depth and choice of talks, workshops, topics and speakers.' },
  { name: 'Venue', definition: 'The building and rooms: seating, temperature, Wi-Fi, location, getting around.' },
  { name: 'Food', definition: 'Catering, coffee, dietary options.' },
  { name: 'Networking', definition: 'Meeting other attendees, social events, the hallway track.' },
  { name: 'Organization', definition: 'Registration, communication from organisers, signage, staff, the conference app.' },
];

export const SAMPLE_SIZE = ANSWERS.length;

export function sampleStudy() {
  return newStudy({
    title: 'Harbor City Dev Days, attendee survey',
    question: 'What should we change next year?',
    context: 'Post-event survey for a two-day developer conference.',
    answers: toAnswers(
      ANSWERS.map(([, text]) => text),
      ANSWERS.map(([group]) => group),
    ),
    themes: normalizeThemes(THEMES),
    sample: true,
  });
}
