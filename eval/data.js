// Synthetic evaluation inputs. Every person, address, number and organisation
// below is invented for this test set. Nothing here comes from a real document.

export const LETTERS = [
  {
    id: 'tax',
    text: `Harbor County Tax Office
Notice of Underpayment - Tax Year 2025

Dear Ms. Imani Okafor,

Our records show an unpaid balance of $412.60 on parcel account HC-2291-00417 for the property at 48 Larkspur Lane, Unit 3, Port Allen, WA 98362. Payment is due by December 12, 2026. After that date a 5% penalty is added each month.

You may pay online or by mail. If you believe this notice is an error, call our office at (360) 555-0142 or write to appeals@harborcounty.example.gov and quote your account number.

Sincerely,
Daniel Reyes
Revenue Officer`,
    gold: ['Imani', 'Okafor', 'HC-2291-00417', '48 Larkspur Lane', '98362', 'Daniel', 'Reyes'],
    question: 'How much do I owe and by when?',
    answer: ['412\\.60', 'December 12'],
  },
  {
    id: 'rent',
    text: `Notice of Rent Increase

Tenant: Mateo Villanueva
Premises: 1207 Juniper Court, Apt 14B, Sacramento, CA 95814

Dear Mateo,

This letter is formal notice that your monthly rent will increase from $1,850 to $1,995 starting February 1, 2027. All other terms of your lease dated March 3, 2024 stay the same.

If you do not plan to renew, you must give written notice 60 days before your lease ends. Questions can be sent to me at priya.raman@brightdoor.example.com or 916-555-0178.

Regards,
Priya Raman
Property Manager, Brightdoor Rentals`,
    gold: ['Mateo', 'Villanueva', '1207 Juniper Court', '14B', '95814', 'priya.raman@brightdoor.example.com', '916-555-0178', 'Priya', 'Raman'],
    question: 'What will my new rent be and when does it start?',
    answer: ['1,?995', 'February 1'],
  },
  {
    id: 'clinic',
    text: `Lakeside Family Clinic - Statement

Patient: Eleanor Whitcombe    Date of birth: 04/17/1958
Patient ID: LFC-778201    Statement date: November 2, 2026

Service on October 9, 2026: office visit and blood panel. Total charges $640.00. Insurance paid $455.00. You owe $185.00, due November 30, 2026.

Your insurer, Northgate Health, processed this claim under member number NGH40039127. If the amount looks wrong, ask us for an itemized bill or call billing at 555-0199.

Mail payments to Lakeside Family Clinic, PO Box 310, Dayton, OH 45402.`,
    gold: ['Eleanor', 'Whitcombe', '04/17/1958', 'LFC-778201', 'NGH40039127'],
    question: 'How much do I have to pay and what is the due date?',
    answer: ['185', 'November 30'],
  },
  {
    id: 'debt',
    text: `Crestline Recovery Services

Re: Account 5519-0034-8821 - original creditor Vantage Card

Dear Mr. Tobias Lindqvist,

This is an attempt to collect a debt. Our records show you owe $2,318.47 on the account above. Unless you dispute this debt in writing within 30 days of receiving this letter, we will assume it is valid.

Send disputes to Crestline Recovery Services, 900 Mill Road, Suite 210, Tulsa, OK 74103. Our reference for your file is CRS/88-41276. You can also reach agent Hannah Cho at 918-555-0164.

This communication is from a debt collector.`,
    gold: ['Tobias', 'Lindqvist', '5519-0034-8821', 'CRS/88-41276', 'Hannah', 'Cho'],
    question: 'How long do I have to dispute this debt?',
    answer: ['30 days'],
  },
  {
    id: 'school',
    text: `Maple Grove Middle School

To the parent or guardian of Aiden Brooks (Grade 7, student no. 2026-4471):

Aiden has been absent 9 days this term. State law requires us to meet with families when absences pass 8 days. Please attend a meeting with the counselor, Mrs. Geraldine Fox, on Thursday, November 19, 2026 at 3:30 PM in Room 12.

If you cannot attend, call the front office at 555-0113 or email attendance@maplegrove.example.edu before November 17.

We have this address on file for you: 77 Orchard Street, Cedar Falls, IA 50613.

Thank you,
Marcus Bell, Assistant Principal`,
    gold: ['Aiden', 'Brooks', '2026-4471', 'Geraldine', 'Fox', '77 Orchard Street', '50613', 'Marcus', 'Bell'],
    question: 'When is the meeting and where?',
    answer: ['November 19', 'Room 12'],
  },
  {
    id: 'denial',
    text: `Northgate Health - Notice of Adverse Benefit Determination

Member: Sofia Marchetti    Member ID: NGH77120456    Claim: CLM-2026-0098812

We reviewed the request from Dr. Alan Petrov for an MRI of the left knee on October 21, 2026. The request is denied because prior authorization was not obtained before the service.

You have the right to appeal within 180 days of this notice. Send your appeal with supporting records to Appeals Unit, Northgate Health, PO Box 9000, Columbus, OH 43216, or fax 614-555-0121. You may owe the provider up to $1,240.00.

If you need help, call Member Services at 1-800-555-0100.`,
    gold: ['Sofia', 'Marchetti', 'NGH77120456', 'CLM-2026-0098812', 'Alan', 'Petrov'],
    question: 'Why was the claim denied and how long do I have to appeal?',
    answer: ['prior authori[sz]ation', '180'],
  },
  {
    id: 'bank',
    text: `First Meridian Bank

Dear Rahul Deshmukh,

Your checking account ending in 4417 was overdrawn by $63.20 on November 5, 2026. We charged a $35.00 overdraft fee. Please deposit at least $98.20 by November 14, 2026 to avoid a second fee and possible account closure.

For your security we will never ask for your full account number 000218894417 or your online banking password by email. We sent this letter to 2 Wren Close, Flat 5, Leeds LS6 2AB.

To talk to us, call 0113 555 0147 and give customer reference FM-R-309551.`,
    gold: ['Rahul', 'Deshmukh', '000218894417', '2 Wren Close', 'LS6 2AB', 'FM-R-309551'],
    question: 'How much should I deposit and by what date?',
    answer: ['98\\.20', 'November 14'],
  },
  {
    id: 'power',
    text: `Tri-River Electric - Disconnection Warning

Service address: 3310 Bellflower Avenue, Mesa, AZ 85204
Account holder: Grace Nakamura and Owen Nakamura
Account number: 71-4420-9956-3

Your account is $287.15 past due. Service will be disconnected on or after November 24, 2026 unless we receive payment or you set up a payment plan. A reconnection fee of $45.00 applies after disconnection.

If someone in your home depends on medical equipment, tell us right away at 480-555-0185. You can also email help@tririver.example.com with your account number.`,
    gold: ['Grace', 'Owen', 'Nakamura', '3310 Bellflower Avenue', '85204', '71-4420-9956-3'],
    question: 'When will the power be cut off and how much is past due?',
    answer: ['November 24', '287\\.15'],
  },
  {
    id: 'visa',
    text: `Department of Home Affairs - Biometrics Appointment Notice

Applicant: Nguyen Thi Lan    Date of birth: 12 March 1994
Application reference: DHA-IMM-55820317    Passport number: C4821907

You must attend a biometrics appointment on Tuesday, December 1, 2026 at 10:15 AM at the Riverside Service Centre, Counter 6. Bring this notice, your passport, and one recent photograph.

If you miss the appointment without rescheduling at least 48 hours before, your application may be refused. To reschedule, sign in to your online account or call 555-0156. We will contact you at lan.nguyen94@mailbox.example.org.`,
    gold: ['Nguyen', 'Thi', 'Lan', '12 March 1994', 'DHA-IMM-55820317', 'C4821907', 'lan.nguyen94@mailbox.example.org'],
    question: 'What happens if I miss the appointment?',
    answer: ['refus'],
  },
  {
    id: 'warning',
    text: `Kestrel Logistics - Human Resources

Private and confidential

Dear Fatima Al-Sayed,

Following the meeting on November 6, 2026 with your manager, Gregory Hale, this letter confirms a written warning for three late arrivals in October. The warning stays on your file for 6 months.

You may respond in writing within 10 working days. Your employee number is KL-204417 and your response should be sent to hr.cases@kestrel.example.com.

If your attendance does not improve, further action may follow, up to and including dismissal. A copy has been posted to 15 Gable End Road, Bristol BS7 9QT.

Yours sincerely,
Linda Osei, HR Business Partner`,
    gold: ['Fatima', 'Al-Sayed', 'Gregory', 'Hale', 'KL-204417', '15 Gable End Road', 'BS7 9QT', 'Linda', 'Osei'],
    question: 'How many days do I have to respond?',
    answer: ['\\b10\\b|\\bten\\b'],
  },
];

export const DENSE = [
  { text: 'Unless the outstanding balance of $412.60 is remitted on or before December 12, 2026, a penalty of five percent shall accrue monthly thereafter.', keep: ['412\\.60', 'December 12', '5|five'] },
  { text: 'Failure to furnish written notice of non-renewal no fewer than sixty (60) days prior to the expiration of the tenancy shall result in the automatic continuation thereof on a month-to-month basis.', keep: ['60|sixty', 'month'] },
  { text: "The aforementioned claim was adjudicated and the member's residual financial responsibility, after application of the plan allowance, has been determined to be $185.00.", keep: ['185'] },
  { text: 'Absent a written dispute tendered within thirty (30) days of receipt hereof, the debt shall be presumed valid by this office.', keep: ['30|thirty', 'writ'] },
  { text: "Pursuant to state attendance statutes, a conference with the guardian is mandated whenever a pupil's unexcused absences exceed eight (8) instructional days in a term.", keep: ['8|eight'] },
  { text: 'Coverage for the requested imaging service is denied inasmuch as prior authorization was not secured antecedent to the rendering of said service.', keep: ['authori|approv|permission', 'before|first|in advance|prior'] },
  { text: 'To forestall the assessment of an additional fee and the potential closure of the account, a deposit of not less than $98.20 must be effected by November 14, 2026.', keep: ['98\\.20', 'November 14'] },
  { text: 'Service shall be subject to disconnection on or after November 24, 2026, absent receipt of the arrears or the establishment of an approved payment arrangement.', keep: ['November 24', 'pay'] },
  { text: 'Non-attendance without rescheduling at least 48 hours in advance may result in the refusal of the application.', keep: ['48'] },
  { text: 'The written warning shall remain on the personnel file for a period of six (6) months, and any further infraction may occasion additional measures up to and including dismissal.', keep: ['6|six', 'dismiss|fired|lose your job|termination|let go'] },
];

export const FEEDBACK_CONTEXT = 'Post-event survey for a two-day developer conference. Question asked: "What should we change next year?"';

export const CODEBOOK = [
  { id: 'SCHEDULE', definition: 'Timing of sessions, overlaps between talks, length of breaks, length of the day.' },
  { id: 'CONTENT', definition: 'Quality, depth and choice of talks, workshops, topics and speakers.' },
  { id: 'VENUE', definition: 'The building and rooms: seating, temperature, Wi-Fi, location, getting around.' },
  { id: 'FOOD', definition: 'Catering, coffee, dietary options.' },
  { id: 'NETWORKING', definition: 'Meeting other attendees, social events, the hallway track.' },
  { id: 'ORGANIZATION', definition: 'Registration, communication from organisers, signage, staff, the conference app.' },
];

// themes: accepted exact set (null = excluded from theme scoring because the gold is ambiguous).
// sentiment: accepted values. flag: reports harassment, discrimination or a safety problem.
export const COMMENTS = [
  { text: 'The Wi-Fi dropped every time more than fifty people were in the main hall. Hard to follow the live coding.', themes: ['VENUE'], sentiment: ['negative'], flag: false },
  { text: 'Loved the deep-dive on offline sync, but the beginner track repeated the same intro three times.', themes: ['CONTENT'], sentiment: ['mixed'], flag: false },
  { text: 'Two talks I wanted were scheduled at the same time. Please stagger the popular ones.', themes: ['SCHEDULE'], sentiment: ['negative'], flag: false },
  { text: 'No vegan option at lunch on day two, and the coffee ran out by 10.', themes: ['FOOD'], sentiment: ['negative'], flag: false },
  { text: 'Registration line took 40 minutes and nobody told us there was a second desk.', themes: ['ORGANIZATION'], sentiment: ['negative'], flag: false },
  { text: "The evening meetup was the best part. I met two people I'm now building something with.", themes: ['NETWORKING'], sentiment: ['positive'], flag: false },
  { text: 'Rooms were freezing and the chairs were painful after an hour.', themes: ['VENUE'], sentiment: ['negative'], flag: false },
  { text: "A speaker made a joke about my accent during Q&A and a staff member laughed. I'd like someone to contact me about this: dana.k@example.com.", themes: null, sentiment: ['negative'], flag: true },
  { text: 'Breaks were too short to get between buildings, so I missed the start of every afternoon session.', themes: ['SCHEDULE', 'VENUE'], sentiment: ['negative'], flag: false },
  { text: 'Great mix of topics this year. The keynote on local-first apps was worth the trip alone.', themes: ['CONTENT'], sentiment: ['positive'], flag: false },
  { text: 'The conference app never showed room changes. I only found out from a paper sign.', themes: ['ORGANIZATION'], sentiment: ['negative'], flag: false },
  { text: 'Lunch was excellent, especially the noodle bar. More places to sit and eat with others would help people mix.', themes: ['FOOD', 'NETWORKING'], sentiment: ['positive', 'mixed'], flag: false },
  { text: 'Day one ran from 8 to 7. By the last session nobody could concentrate.', themes: ['SCHEDULE'], sentiment: ['negative'], flag: false },
  { text: 'Workshops were too shallow for the price. I wanted real code, not slides.', themes: ['CONTENT'], sentiment: ['negative'], flag: false },
  { text: 'The venue was easy to reach by train and the step-free entrance was clearly marked. Thank you.', themes: ['VENUE'], sentiment: ['positive'], flag: false },
  { text: 'I felt unsafe walking to the after-party venue alone at night. There was no shuttle and no one to ask.', themes: null, sentiment: ['negative'], flag: true },
  { text: 'Nothing to change. Same again please.', themes: [], sentiment: ['positive'], flag: false },
  { text: 'Please send the slides. Emails from the organisers stopped after the event.', themes: ['ORGANIZATION'], sentiment: ['negative', 'neutral'], flag: false },
  { text: 'More structured networking for people who came alone. The hallway is intimidating.', themes: ['NETWORKING'], sentiment: ['negative', 'neutral', 'mixed'], flag: false },
  { text: 'The speaker lineup felt like the same five people as last year. Bring in new voices.', themes: ['CONTENT'], sentiment: ['negative'], flag: false },
];

export const PROFILE = 'Age 29. Citizen of South Korea, living in South Korea. Full-time master\'s student in computer science, second year. Does not work for any company. Household income is below the national median. Not employed by any government agency.';

export const CRITERIA = [
  { text: 'Open to residents of the United States and Canada only.', eligible: 'no' },
  { text: 'Applicants must be enrolled full-time in a graduate degree program at the time of application.', eligible: 'yes' },
  { text: 'Open to individuals aged 18 to 25 on the application deadline.', eligible: 'no' },
  { text: 'Open worldwide except residents of Brazil, Quebec, Italy, Cuba, Iran, Syria, North Korea, Sudan, Belarus and Russia.', eligible: 'yes' },
  { text: 'Teams must include at least one full-time employee of a registered company.', eligible: 'no' },
  { text: 'Applicants must demonstrate financial need; household income must be below the national median.', eligible: 'yes' },
  { text: 'Only undergraduate students in their first or second year may apply.', eligible: 'no' },
  { text: 'Employees of government agencies are not eligible.', eligible: 'yes' },
  { text: 'Applicants must be citizens of an ASEAN member state.', eligible: 'no' },
  { text: 'Open to students of any nationality studying a STEM subject at master\'s or doctoral level.', eligible: 'yes' },
];
