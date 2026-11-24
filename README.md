# Earshot

Earshot sorts confidential open-ended survey answers on your own computer. The cloud writes a report from a tally sheet you can review before sending. Earshot is a web app for desktop Chrome, built for #BuildHybridAI 2026 on Firebase AI Logic.

It is for people who collected feedback after promising to keep it confidential: event organisers, team leads, teachers, researchers. Free-text answers name colleagues, describe health and family matters, and report misconduct. Reading a few hundred of them takes hours, and pasting them into a cloud model breaks the promise.

Try it at https://hyunsikparker.github.io/earshot/ in Chrome on a desktop computer. No sign-in is needed, and the sample answers are made up.

## What it does

1. You paste answers or choose a CSV file, type the question you asked, and name the themes to sort by. Earshot can suggest themes.
2. On this computer, Earshot asks Gemini Nano to label each confidential answer with themes, a tone and a safety flag (harassment, discrimination or feeling unsafe), and to write a one-line gist without identifying details.
3. You review. Gists are shown by default and the original is one click away. Any label can be changed.
4. The right-hand column shows the exact tally sheet the cloud receives for the report. The sheet includes the question and theme definitions. It does not include raw answers.

## How hybrid inference is used

Every inference call goes through the Firebase AI Logic SDK (`firebase/ai`). The kind of data a step handles decides its inference mode. The whole policy is one table in [`src/ai/routes.js`](src/ai/routes.js), enforced by [`src/ai/router.js`](src/ai/router.js).

| Step | Data it sees | Mode | Where it runs |
|---|---|---|---|
| Read an answer | The answers | `ONLY_ON_DEVICE` for a confidential study, `PREFER_ON_DEVICE` otherwise | On the device. For a confidential study the SDK throws when there is no local model, so a missing model cannot turn into an upload. A study you mark as not confidential is read in the cloud when the device cannot read it. |
| Find themes in a sample of answers | The question and up to 12 answers | Same as reading | Same as reading |
| Suggest themes from the question | The question and any survey context you typed | `PREFER_IN_CLOUD` | In the cloud. The SDK falls back to the device when the cloud fails. |
| Write the report | The tally sheet | `ONLY_IN_CLOUD`, then the device | In the cloud. A 429 gets one retry on another free-tier model; a 503 gets up to two retries with backoff. If that fails, the app records why and falls back locally. |
| Shorten the report | The report | `PREFER_ON_DEVICE` | On the device. The cloud takes over when there is no local model. |

Other details:

- **One schema, two paths.** Structured output uses the same JSON schema as `responseSchema` in the cloud and `responseConstraint` on the device.
- **On-device calls run one at a time.** The SDK opens a new local session for each request and destroys the previous one, so the router queues them.
- **Limits on the local model.** The output schema caps list and text lengths. An on-device step that has not answered after 45 seconds is aborted through the prompt's `AbortSignal`, which frees the local model at once, and the next request starts on a new session. While reading, an answer the model fails on twice, or does not answer in time, is marked for labelling by hand and the run goes on. Three failures or two timeouts in a row stop the run and leave those answers unread.
- **Model download.** On first use the app calls `initializeDeviceModel()` after a click and shows the progress. A confidential study waits for the download. Other studies start in the cloud and move to the device when it is ready.
- **Step log.** "Where each step ran" lists each step with its mode, the path that answered (`inferenceSource`) and the reason for any fallback. The same lines go to the console.
- **App Check.** The app starts App Check before any cloud call: the debug provider on localhost, reCAPTCHA Enterprise on the hosted domain.
- **Prompt API.** Chrome's Prompt API is called directly only for `LanguageModel.availability()`, to show whether the local model is there.

## What leaves the computer

For report writing, the cloud request is built from the tally sheet ([`src/study/outbound.js`](src/study/outbound.js)). The sheet holds:

- your question and your description of the survey;
- the theme names and definitions, which you wrote;
- counts per theme with tone, the number of answers with no theme, and the number of safety reports;
- counts per group if your file has a group column, with any count below 3 withheld;
- gists you approve one at a time. A gist cannot be approved if it contains an email address, phone number, link, handle or long number, a capitalised word carried over from the answer, or four consecutive words of the answer.

Before a request is sent, `assertNoVerbatim()` compares the sheet with every answer and blocks it if four consecutive words match. The sheet for the recorded 64-answer sample is about 2.4 KB before any gists are approved.

Limits you should know about. Theme names and definitions are yours, so a name typed there is sent. A gist paraphrases an answer and therefore carries some of its content, which is why gists stay on the device unless you approve them. The name check relies on capitalisation and cannot catch a name that only ever starts a sentence. Withholding small counts does not stop someone subtracting from a total.

## When the cloud cannot write the report

The fallback does not ask the small model to write. The page builds statements straight from the sheet, such as "Organization came up most often, in 18 answers." The local model chooses which statements lead, and every count follows. With no model at all, the page shows the same statements in a fixed order.

Under a finished report, `findUnsupported()` checks the numbers and flags comparisons or advice the tally cannot support. It uses the counts from when the report was written, or the current tally for reports saved before the check was added. The check names the first flagged statement and says if it found others. It does not delete or change any report text.

## Free-tier limits

Report writing uses `gemini-3.5-flash-lite`, separate from the other cloud steps on `gemini-3.8-flash`. A report that receives HTTP 429 retries once on `gemini-4-hydrogen`. All three are listed as not requiring billing in the Firebase AI Logic model list used for this project. Project-wide free-tier limits still apply.

On the GitHub Pages demo, this build allows **five cloud reading requests per browser per UTC day** for non-confidential studies. Answer reads and theme discovery from a sample share that limit. Each request uses a slot before it is sent, even if it fails. Tabs in the same browser storage share the counter; if it cannot be stored, the app does not send the request. This is a browser limit, not a project-wide quota increase or server-side cap. Local runs, recorded labels and report writing do not use the five slots.

## Measurements

All inputs are synthetic and the labels were written for this project, with no independent annotator, so these numbers show that the approach works on this kind of text. They are not a benchmark.

- Reading 110 labelled answers in Chrome 157 on an Apple M4 Mac. Three runs on 16 November 2026, after the abort described above was added, read every answer: theme micro-F1 was 0.962, 0.941 and 0.946 (0.815, 0.815 and 0.800 with strict scoring), tone was correct for 107 of 108 each time, and all 7 safety reports were flagged each time with no false alarms. 90 of the 110 answers received the same set of themes in all three runs. No planted name or contact detail was kept in a gist (18 answers carried one). The median time per answer was 22, 11 and 9 seconds. The slowest answer took 31 seconds, so the 45-second limit was not reached in these runs. Of four runs on 15 November, three read every answer (0.951, 0.921 and 0.936; 0.825, 0.796 and 0.804 with strict scoring; tone correct for 106, 106 and 105 of 108). In the fourth the local model stopped answering for 29 answers in a row and the limit left them unread, which gives 0.787 over all 110 answers and 0.940 over the 81 it did read. At that time the limit gave up on a slow request without stopping the generation, and later requests queued behind it; the abort was added because of that run. The median on 15 November was 2.3 seconds per answer in the first run and between 6 and 14 seconds in the later ones. I have not found why the later runs, on both days, were slower than that first one. An earlier attempt stopped at answer 99, when the model generated until it reached its output limit; the output caps and the time limit were added because of it. Results are in [`eval/results/2026-11-16-read-110-3runs.json`](eval/results/2026-11-16-read-110-3runs.json), [`eval/results/2026-11-15-read-110.json`](eval/results/2026-11-15-read-110.json) and [`eval/results/2026-11-15-read-110-repeat.json`](eval/results/2026-11-15-read-110-repeat.json), the harness is [`eval/read110.js`](eval/read110.js), and the labels and scoring rules are in [`eval/answers110.js`](eval/answers110.js).
- [`eval/results/2026-11-15-concept-selection.json`](eval/results/2026-11-15-concept-selection.json) holds the first small measurements that were used to choose the idea.

## Run it locally

You need Node 22 or later and Chrome 139 or later on a desktop computer with the built-in model available. The header says "Local model ready" when it is.

```
npm install
npm run build
python3 -m http.server 8804 --bind 127.0.0.1 --directory dist
```

Open http://localhost:8804 and choose "Open the sample study".

Without a Firebase project the app runs its on-device steps and summarises the counts locally. To connect the cloud:

1. Create a Firebase project on the Spark plan, add a web app, and set up AI Logic with the Gemini Developer API.
2. Copy the web app's config into `src/config/firebase-config.js`. These values are public identifiers.
3. Rebuild and open the app on localhost. The console prints an App Check debug token. Register it in the Firebase console under App Check > Apps > Manage debug tokens. Do not commit it.
4. For a hosted copy, create a reCAPTCHA Enterprise key for the domain and put its site key in the same file.

## Test the sample study

In desktop Chrome, choose **Open the sample study**, then pick one of these paths:

1. **See a finished run without a download.** Choose **Show labels recorded on another computer**. It is available before reading starts, even if Chrome says the local model has not finished downloading. The page marks the labels as recorded.
2. **Read a few answers.** Choose **Start reading**, then **Pause** after a few answers. If the local model is not ready, Chrome needs to download it first. You can write a report from the answers counted so far.
3. **Read all 64 answers.** Choose **Start reading** and let it finish. A full local read took about 15 minutes on an M4 Mac laptop, not including the model download.

In the report pane, open **See the exact text** to review the tally sheet, then choose **Send the counts and write the report**. **Where each step ran** distinguishes recorded labels, local reading and cloud writing.

## Tests

`npm test` runs the Vitest suite. It covers:

- which mode and path each step uses for every combination of local model state, connection and cloud setup;
- that reading a confidential study never calls the cloud, including when the local model is missing or fails on an answer;
- retries, fallback reasons, the on-device queue, and aborting and recovering from a local generation that runs on;
- parsing, tallies and withheld small counts;
- the wording checks on anything that leaves the computer;
- the recorded sample shortcut and a local run paused with a partial tally;
- the in-app report check for matching and unsupported claims, and the fallback report against generated tally sheets;
- the real Firebase SDK driven against a stand-in `LanguageModel`, asserting that `inferenceSource` is `on_device` and that no network request is made.

`eval/index.html` and `eval/read.html` are the measurement pages. They are built to `dist/eval/` and run on-device only.

## Status on 16 November 2026

The on-device path has been run end to end in Chrome 157. The cloud path runs against a Firebase project on the Spark plan with the Gemini Developer API, and every cloud request carries an App Check token. On 16 November `gemini-3.5-flash-lite` wrote the report from the tally sheet in 2.4 to 7.3 seconds across four requests, one of them from the hosted copy, where App Check used reCAPTCHA Enterprise. `gemini-3.8-flash` returned an error once and timed out twice that day, so the report step uses the lighter model; the reason is noted in [`src/config/firebase-config.js`](src/config/firebase-config.js).

## Built during the submission period

Everything in this repository was written from 15 November 2026 onwards, within the submission period. There is no earlier code.

## AI assistance

Earshot was built with Claude Code, an AI coding assistant, which wrote most of the code, tests, sample data and documentation. The on-device measurements were run in Chrome on my own computer.

## Third-party software

- Firebase JavaScript SDK 13.3.0, Apache-2.0.
- Atkinson Hyperlegible Next by the Braille Institute, SIL Open Font License 1.1, bundled through `@fontsource-variable/atkinson-hyperlegible-next`.
- Vite, Vitest and jsdom, MIT, for building and testing.

## License

MIT. See [LICENSE](LICENSE).
