import"./index.esm-CP7w2rKE.js";import{C as e,D as t,E as n,S as r,T as i,_ as a,a as o,b as s,c,g as l,h as u,i as d,m as f,n as ee,o as te,p,r as ne,s as re,t as ie,u as ae,v as oe,w as se,x as ce,y as le}from"./conference-XF1AjW_F.js";function ue(e){return e.answers.filter(t=>t.shareGist&&t.reading?.gist&&c(t.reading.gist,t.text,e.themes.map(e=>e.name)).ok).map(e=>e.reading.gist)}function de(e){let t=p(e),n=ue(e),r={question:e.question,about:e.context,themes:e.themes.map(({name:e,definition:t})=>({name:e,definition:t})),answers_received:t.answers,answers_read:t.read,tallies:t.themes.map(e=>({theme:e.name,answers:e.count,positive:e.positive,negative:e.negative,mixed:e.mixed,neutral:e.neutral})),answers_with_no_theme:t.noTheme,safety_reports:t.safetyReports,overall_tone:t.tone};return t.groups.length&&(r.by_group=t.groups),n.length&&(r.approved_gists=n),r}var m=e=>JSON.stringify(e,null,2);function h(e,t){let n=[t.question,t.context,...t.themes.flatMap(e=>[e.name,e.definition])];return re(e,t.answers,n),{bytes:new TextEncoder().encode(m(e)).length}}var fe=`You write up open-ended survey results for the person who ran the survey.
You are given a tally sheet. You never see the answers themselves, so never quote a respondent and never invent what someone said.
Every number you mention must appear in the sheet.`;function pe(e){return`This tally sheet is everything you know about the answers.

${m(e)}

Write a report in Markdown with these sections, in this order:
## What people talked about most
## What is going well
## What to fix first
${e.safety_reports>0?`## Safety reports
`:``}## Questions for next time

Name themes exactly as they are written in the sheet and give their counts. Use plain language and short paragraphs or bullet points. Stay under 280 words.
${e.safety_reports>0?`Under "Safety reports" give the count and say that the survey owner should read those answers personally and follow up. Do not guess what they say.
`:``}${e.approved_gists?`You may use the approved gists as examples in your own words. Do not present them as quotes.
`:``}`}var me=e=>`Shorten this report to about half its length. Keep every section heading and every number.

${e}`,he=[`negative`,`positive`,`mixed`,`neutral`],g=e=>`${e} ${e===1?`answer`:`answers`}`,_=e=>e.length<=2?e.join(` and `):`${e.slice(0,-1).join(`, `)} and ${e.at(-1)}`,v=e=>he.filter(t=>e[t]>0).map(t=>`${e[t]} ${t}`);function y(e,t){let n=Math.max(0,...e.map(e=>e[t]));return n>0?{value:n,rows:e.filter(e=>e[t]===n)}:null}var ge=e=>Object.entries(e.themes).filter(([,e])=>typeof e==`number`).map(([e,t])=>({theme:e,answers:t}));function b(e){let t=[],n=(e,n)=>t.push({id:e,text:n}),r=e.safety_reports;r>0&&n(`safety`,`${g(r)} ${r===1?`was marked as a safety report`:`were marked as safety reports`}.`);let i=y(e.tallies,`answers`);i&&n(`most-mentioned`,`${_(i.rows.map(e=>e.theme))} came up most often, in ${g(i.value)}${i.rows.length>1?` each`:``}.`);for(let t of[`negative`,`positive`]){let r=y(e.tallies,t);if(!r)continue;let i=r.rows.length===1?`${r.value} of its ${r.rows[0].answers}`:`${r.value} each`;n(`most-${t}`,`${_(r.rows.map(e=>e.theme))} had the most ${t} answers: ${i}.`)}let a=v(e.overall_tone);a.length&&n(`tone`,`Across the ${g(e.answers_read)} read, the tone was ${_(a)}.`);let o=e.answers_with_no_theme;o>0&&n(`no-theme`,`${g(o)} ${o===1?`fits`:`fit`} none of the themes.`);for(let t of e.by_group??[]){let e=y(ge(t),`answers`);e&&n(`group:${t.group}`,`In the "${t.group}" group (${g(t.answers)}), ${_(e.rows.map(e=>e.theme))} came up most often, in ${e.value}${e.rows.length>1?` each`:``}.`)}return e.answers_read===e.answers_received?n(`read`,e.answers_received===1?`The one answer was read.`:`All ${g(e.answers_received)} were read.`):n(`read`,`${e.answers_read} of ${g(e.answers_received)} have been read so far.`),{headline:t,counts:[...e.tallies].sort((e,t)=>t.answers-e.answers).map(e=>{let t=v(e);return`${e.theme}: ${g(e.answers)}${t.length?` (${t.join(`, `)})`:``}.`})}}var _e=`You help the owner of a survey decide what to look at first. You answer with JSON only.`;function ve(e,t){return`Survey question: "${e.question}"
These statements about the answers are all true:
${t.headline.map((e,t)=>`${t+1}. ${e.text}`).join(`
`)}
Choose the ${Math.min(4,t.headline.length)} statements the survey owner most needs to see, most important first. Answer with their numbers.`}var ye=e=>({type:`object`,properties:{picks:{type:`array`,maxItems:e.headline.length,items:{type:`string`,enum:e.headline.map((e,t)=>String(t+1))}}},required:[`picks`]});function be(e,t){let n;try{n=JSON.parse(String(e).replace(/^```(?:json)?\s*|\s*```$/g,``))}catch{return[]}let r=[];for(let e of Array.isArray(n?.picks)?n.picks:[]){let n=/^\d+$/.test(String(e))?t.headline[Number(e)-1]:null;n&&!r.includes(n.id)&&r.push(n.id)}return r}function xe(e,t=[]){let n=b(e),r=new Map(n.headline.map(e=>[e.id,e.text])),i=[],a=e=>{r.has(e)&&!i.includes(e)&&i.length<5&&i.push(e)};a(`safety`),(t??[]).forEach(a);for(let e of n.headline){if(i.length>=Math.min(4,n.headline.length))break;a(e.id)}return[`## Summary of the counts`,...i.map(e=>`- ${r.get(e)}`),``,`## Counts by theme`,...n.counts.map(e=>`- ${e}`)].join(`
`)}var Se=`15 November 2026`,Ce=[`SCHEDULE`,`CONTENT`,`VENUE`,`FOOD`,`NETWORKING`,`ORGANIZATION`],we={p:`positive`,n:`negative`,m:`mixed`,u:`neutral`},Te=`2|n|0|Wi-Fi connectivity issues impacted the conference experience for attendees.
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
0|n|0|The early workshop start time was unwelcome for some attendees.`.split(`
`);function x(e){return!!e?.sample&&e.answers.length===Te.length&&e.themes.map(e=>e.id).join()===Ce.join()}function Ee(){return Te.map(e=>{let[t,n,r,...i]=e.split(`|`);return{themes:[...t].map(e=>Ce[Number(e)]),sentiment:we[n],flag:r===`1`,gist:i.join(`|`),source:`recorded`,ms:0,edited:!1}})}var S=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),C=(e,t=document)=>t.querySelector(e);function De(e){return e<1024?`${e} bytes`:`${(e/1024).toFixed(1)} KB`}var w=(e,t,n=`${t}s`)=>`${e} ${e===1?t:n}`,Oe=[[4.6,3.2,3.6,20.8],[9.8,3,10.4,21],[16.4,3.4,15.6,20.6],[21.6,3.1,22.2,20.9]];function ke(e,t){let n=``;for(let r=0;r<Math.min(e,4);r+=1){let[i,a,o,s]=Oe[r];n+=`<path${t&&r===e-1?` class="is-new"`:``} d="M${i} ${a}L${o} ${s}"/>`}return e===5&&(n+=`<path${t?` class="is-new"`:``} d="M1.4 17.2L24.8 6.4"/>`),`<svg class="tally__gate" viewBox="0 0 26 24" width="26" height="24" aria-hidden="true" focusable="false">${n}</svg>`}function T(e,{label:t=``,animate:n=!1,max:r=75}={}){let i=Math.min(e,r),a=Math.ceil(i/5),o=``;for(let e=0;e<a;e+=1){let t=Math.min(5,i-e*5);o+=ke(t,n&&e===a-1)}let s=e>r?`<span class="tally__more">and ${e-r} more</span>`:``;return`<span class="tally" role="img" aria-label="${S(t?`${t}: ${e}`:String(e))}">${o}${s}</span>`}var E=e=>S(e).replace(/\*\*(.+?)\*\*/g,`<strong>$1</strong>`);function D(e){let t=[],n=!1,r=[],i=()=>{r.length&&t.push(`<p>${r.join(` `)}</p>`),r=[],n&&t.push(`</ul>`),n=!1};for(let a of String(e??``).split(/\r?\n/)){let e=a.trim(),o=e.match(/^#{1,6}\s+(.*)$/),s=e.match(/^[-*•]\s+(.*)$/);e?o?(i(),t.push(`<h3>${E(o[1])}</h3>`)):s?(r.length&&i(),n||t.push(`<ul>`),n=!0,t.push(`<li>${E(s[1])}</li>`)):(n&&i(),r.push(E(e))):i()}return i(),t.join(``)}var O=C(`#app`),k={study:d(),device:`checking`,download:null,online:navigator.onLine,run:{active:!1,stop:!1,problem:``},filter:`all`,open:new Set,editing:new Set,pane:`answers`,intakeProblem:``,frameProblem:``,suggest:{busy:!1,note:``,problem:``},report:{busy:!1,live:``,problem:``},lastCounts:{},storageFull:!1},A=r({sdk:i(),env:{deviceAvailability:e,online:()=>navigator.onLine,cloudConfigured:t},cloudModels:n,log(e){if(console.info(`[earshot]`,e.route,e.mode,`->`,e.source??`failed (${e.error})`,e.fallback?`fallback: ${e.fallback.reason}`:``,`${e.ms} ms`),e.route===`read`||!k.study)return;let{route:t,label:n,mode:r,source:i,ms:a,fallback:o,error:s,at:c}=e;k.study.steps=[...k.study.steps??[],{route:t,label:n,mode:r,source:i,ms:a,fallback:o,error:s,at:c}].slice(-40),Y()}}),j={"not-configured":`the cloud is not connected`,offline:`this computer is offline`,quota:`the cloud model reached its limit`,blocked:`the cloud refused the request`,unavailable:`the cloud model was unavailable`,network:`the cloud could not be reached`,"cloud-error":`the cloud could not finish`,"device-unavailable":`this browser has no local model`,"device-not-ready":`the local model is still downloading`,"device-error":`the local model could not finish`,"device-timeout":`the local model took too long`,"no-path":`neither the cloud nor a local model was available`};function M(e){if(e?.name===`OutboundBlocked`)return e.message;switch(e?.code){case`device-unavailable`:return`This browser has no local model, so confidential answers cannot be read here. Open Earshot in Chrome on a desktop computer that has built-in AI.`;case`device-not-ready`:return`The local model has not finished downloading.`;case`device-error`:return`The local model stopped before it finished. Try again.`;case`device-timeout`:return`The local model took too long and was stopped. Try again.`;case`no-path`:return`Neither the local model nor the cloud is available right now.`;case`quota`:return`The cloud model has reached its limit for now. Try again in a few minutes.`;case`blocked`:return`The cloud refused the request.`;case`offline`:case`network`:return`The cloud cannot be reached. Check the connection.`;default:return`That did not work. Try again.`}}var N=e=>e===`in_cloud`?`in the cloud`:`on this computer`,Ae=()=>k.online&&t();function P(e){let t=document.activeElement;if(!t||t===e||!e.contains(t))return()=>{};let n=t.dataset,r=[`action`,`id`,`theme`,`key`,`index`,`input`,`change`,`pane`].map(e=>n[e]===void 0?``:`[data-${e}="${CSS.escape(n[e])}"]`).join(``),i=t.closest(`[id]`)?.id,a=t.matches(`input[type="text"], textarea`)?[t.selectionStart,t.selectionEnd]:null;return()=>{if(document.activeElement!==e&&e.contains(document.activeElement))return;let t=r&&e.querySelector(r)||i&&document.getElementById(i)?.querySelector(`button:not([disabled]), input, summary`);t&&(t.focus({preventScroll:!0}),a&&t.setSelectionRange(...a))}}var F=0;function I(){clearTimeout(F),k.study&&(k.storageFull=!te(k.study))}function L(){clearTimeout(F),F=setTimeout(I,400)}function R(){C(`#brand`).innerHTML=`${T(5,{label:`Earshot`})}<span>Earshot</span>`,C(`#study-title`).textContent=k.study?k.study.title:``;let e={checking:[`Checking the local model`,!1],available:[`Local model ready`,!0],downloadable:[`Local model not downloaded yet`,!1],downloading:[k.download==null?`Downloading the local model`:`Downloading the local model, ${Math.round(k.download*100)}%`,!1]}[k.device]??[`No local model in this browser`,!1],n=k.online?t()?[`Cloud ready`,!0]:[`Cloud not connected`,!1]:[`Offline`,!1];C(`#status`).innerHTML=[e,n].map(([e,t])=>`<span class="status" data-on="${t}">${S(e)}</span>`).join(``)}async function z(){let t=await e();(k.device!==`downloading`||t!==`downloadable`)&&(k.device=t),R(),W()}function B(){O.innerHTML=`
    <section class="start">
      <div>
        <h1 tabindex="-1">Read every answer. Repeat none of them.</h1>
        <p class="start__lede">Earshot sorts the open-ended answers from a survey you promised to keep confidential. They are read on this computer. The cloud gets only the counts and writes the report from them.</p>
        <div class="crossing">
          <div class="crossing__side">
            <h2>Stays on this computer</h2>
            <p class="slip">The Wi-Fi dropped every time more than fifty people were in the main hall.</p>
            <p class="slip">No vegan option at lunch on day two, and the coffee ran out by 10.</p>
            <p class="slip">Rooms were freezing and the chairs were painful after an hour.</p>
          </div>
          <div class="crossing__side">
            <h2>Goes to the cloud</h2>
            <dl>
              <dt>Venue</dt><dd>${T(2,{label:`Venue`})}</dd>
              <dt>Food</dt><dd>${T(1,{label:`Food`})}</dd>
            </dl>
          </div>
        </div>
      </div>
      <form class="intake" data-form="intake">
        <label for="paste">Your answers</label>
        <textarea id="paste" name="paste" spellcheck="false" placeholder="Paste one answer per line, or a table copied from a spreadsheet"></textarea>
        ${k.intakeProblem?`<p class="problem" role="alert">${S(k.intakeProblem)}</p>`:``}
        <div class="intake__actions">
          <button class="btn btn--primary" type="submit">Continue</button>
          <label class="btn file">Choose a CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-change="file" /></label>
        </div>
        <div class="intake__sample">
          <button class="linkbtn" type="button" data-action="sample">Open the sample study</button>
          <span class="hint">${ie} made-up answers from a conference that does not exist.</span>
        </div>
      </form>
    </section>`}function V(e,t=`Untitled study`){if(!e.trim())return k.intakeProblem=`There is nothing to read yet. Paste at least one answer.`,B();let n=ce(e);return n.answers.length===0?(k.intakeProblem=`No answers were found in that text.`,B()):(k.intakeProblem=``,k.study=o({title:t,answers:n.answers,themes:[{name:``,definition:``},{name:``,definition:``}]}),k.study.intake={kind:n.kind,answerColumn:n.answerColumn,groupColumn:n.groupColumn},I(),$())}var je=e=>e?`Only the local model on this computer reads them. If this browser has none, they are not read at all.`:`The local model reads them when it can. If this browser has none, the cloud model reads them instead.`;function Me(e){let t=e.intake;return!t||t.kind!==`table`?`One answer per line.`:`Taken from the column "${t.answerColumn}"${t.groupColumn?`, grouped by "${t.groupColumn}"`:``}.`}function H(){let e=k.study,t=P(O),n=k.suggest.busy?`disabled`:``,r=e.themes.map((e,t)=>`
        <li class="theme-row">
          <input type="text" data-input="theme-name" data-index="${t}" value="${S(e.name)}" placeholder="Theme" aria-label="Theme ${t+1} name" maxlength="40" />
          <input type="text" data-input="theme-definition" data-index="${t}" value="${S(e.definition)}" placeholder="What belongs here" aria-label="Theme ${t+1} definition" maxlength="200" />
          <button class="linkbtn" type="button" data-action="remove-theme" data-index="${t}" aria-label="Remove theme ${t+1}">Remove</button>
        </li>`).join(``);O.innerHTML=`
    <section class="frame">
      <div class="frame__head">
        <h1 tabindex="-1">${w(e.answers.length,`answer`)} to read</h1>
        <p class="hint">${e.sample?`Sample study. Every answer in it is made up.`:S(Me(e))}</p>
      </div>
      <div>
        <div class="field"><label for="title">Name of this study</label><input id="title" type="text" data-input="title" value="${S(e.title)}" /></div>
        <div class="field"><label for="question">The question you asked</label><input id="question" type="text" data-input="question" value="${S(e.question)}" placeholder="What should we change next year?" /></div>
        <div class="field"><label for="context">About the survey</label><input id="context" type="text" data-input="context" value="${S(e.context)}" placeholder="Who answered, and when" /></div>
        <div class="field">
          <label class="check"><input type="checkbox" data-change="confidential" ${e.confidential?`checked`:``} /><span class="field__label">These answers are confidential</span></label>
          <p class="hint" id="confidential-hint">${je(e.confidential)}</p>
        </div>
      </div>
      <div>
        <h2>Themes to sort by</h2>
        <ul class="themes-edit">${r}</ul>
        <div class="frame__tools">
          <button class="linkbtn" type="button" data-action="add-theme" ${e.themes.length>=12?`disabled`:``}>Add a theme</button>
          <button class="linkbtn" type="button" data-action="suggest-question" ${n}>Suggest themes from the question</button>
          <button class="linkbtn" type="button" data-action="suggest-sample" ${n}>Suggest themes from a sample of answers</button>
        </div>
        <p class="hint" aria-live="polite">${S(k.suggest.busy?`Thinking about themes.`:k.suggest.note)}</p>
        ${k.suggest.problem?`<p class="problem" role="alert">${S(k.suggest.problem)}</p>`:``}
      </div>
      <div class="frame__foot">
        <button class="btn btn--primary" type="button" data-action="start-reading">Start reading</button>
        <button class="linkbtn" type="button" data-action="discard">Discard and start over</button>
        ${k.frameProblem?`<p class="problem" role="alert">${S(k.frameProblem)}</p>`:``}
      </div>
    </section>`,t()}async function Ne(e){let t=k.study;if(e===`question`&&!t.question.trim())return k.suggest={busy:!1,note:``,problem:`Type the question you asked first.`},H();k.suggest={busy:!0,note:``,problem:``},H();try{let n=e===`question`?await A.run(`suggest`,{prompt:s(t),system:u,schema:f}):await A.run(`discover`,{prompt:l({question:t.question,sample:le(t.answers)}),system:u,schema:f,confidential:t.confidential}),r=oe(n.text),i=t.themes.filter(e=>e.name.trim()),a=new Set(i.map(e=>e.name.trim().toLowerCase())),o=r.filter(e=>!a.has(e.name.toLowerCase())).slice(0,12-i.length);t.themes=[...i,...o.map(({name:e,definition:t})=>({name:e,definition:t}))];let c=n.fallback?`, because ${j[n.fallback.reason]??`the other path was not available`}`:``;k.suggest={busy:!1,problem:``,note:o.length?`${w(o.length,`theme`)} suggested ${N(n.source)}${e===`sample`?` from 12 of the answers`:` from your question`}${c}.`:`No new themes came back. Add your own, or try again.`},I()}catch(e){k.suggest={busy:!1,note:``,problem:M(e)}}k.study===t&&!t.started&&H()}function Pe(){let e=k.study,t=a(e.themes);return k.frameProblem=e.question.trim()?t.length<2?`Name at least two themes to sort the answers by.`:``:`Type the question you asked, so the answers are read in context.`,k.frameProblem?H():(e.themes=t,e.started=!0,I(),$(),Ue())}function Fe(){let e=(e,t)=>`<button type="button" data-action="tab" data-pane="${e}" aria-current="${k.pane===e}">${t}</button>`;O.innerHTML=`
    <nav class="tabs" aria-label="Parts of the study">${e(`themes`,`Themes`)}${e(`answers`,`Answers`)}${e(`sheet`,`Report`)}</nav>
    <div class="work" data-pane="${k.pane}">
      <aside class="pane pane--themes" id="pane-themes" aria-label="Themes"></aside>
      <section class="pane pane--answers" id="pane-answers" aria-label="Answers"></section>
      <aside class="pane pane--sheet" aria-label="What leaves this computer">
        <div class="sheet-block" id="sheet-block"></div>
        <div class="report" id="report"></div>
        <details class="audit" id="audit"></details>
      </aside>
    </div>`,U(),G(),q(),J(),Y()}function Ie(e){let t=[`negative`,`positive`,`mixed`,`neutral`].filter(t=>e[t]>0).map(t=>`${e[t]} ${t}`);return t.length?`<span class="theme__tone">${t.join(`, `)}</span>`:``}function U(){let e=C(`#pane-themes`);if(!e)return;let t=P(e),n=p(k.study),r=(e,t,n,r=``,i=``)=>{let a=(k.lastCounts[e]??0)<n;return k.lastCounts[e]=n,`<button class="theme ${i}" type="button" data-action="filter" data-key="${S(e)}" aria-pressed="${k.filter===e}">
      <span class="theme__name">${S(t)}</span><span class="theme__count">${n}</span>${n?T(n,{label:t,animate:a}):``}${r}</button>`};e.innerHTML=`
    <h2 tabindex="-1">Themes</h2>
    <button class="theme" type="button" data-action="filter" data-key="all" aria-pressed="${k.filter===`all`}"><span class="theme__name">All answers</span><span class="theme__count">${n.answers}</span></button>
    ${n.themes.map(e=>r(e.id,e.name,e.count,Ie(e))).join(``)}
    ${r(`none`,`No theme`,n.noTheme)}
    ${r(`flag`,`Safety reports`,n.safetyReports,``,`theme--flag`)}
    <div class="progress" id="progress"></div>`,W(),t()}function W(){let e=k.study;if(!e?.started)return;let t=e.answers.length,n=e.answers.filter(e=>e.reading).length,r=t=>e.answers.filter(e=>e.reading?.source===t).length,i=r(`in_cloud`),a=i===0?`on this computer`:i===n?`in the cloud`:`(${n-i} on this computer, ${i} in the cloud)`,o=n===t?`All ${w(t,`answer`)} read ${a}.`:k.run.active?`Reading ${a}: ${n} of ${t}`:`${n} of ${t} read`;r(`recorded`)&&(o=`Showing labels recorded on another computer on ${Se}. Nothing was read in this browser.`),k.run.active&&k.device===`downloading`&&(o=k.download==null?`Downloading the local model. Reading starts when it is ready.`:`Downloading the local model, ${Math.round(k.download*100)}%. Reading starts when it is ready.`);let s=``;k.run.active?s=`<button class="btn" type="button" data-action="pause" ${k.run.stop?`aria-disabled="true"`:``}>${k.run.stop?`Pausing`:`Pause`}</button>`:n<t&&(s=`<button class="btn btn--primary" type="button" data-action="read">${n===0?`Start reading`:`Continue reading`}</button>`);let c=![`checking`,`available`,`downloadable`,`downloading`].includes(k.device),l=!k.run.active&&n===0&&c&&x(e)?`<button class="btn" type="button" data-action="recorded">Show labels recorded on another computer</button>`:``,u=`
    <p aria-live="polite">${S(o)}</p>
    <div class="progress__bar" role="progressbar" aria-label="Answers read" aria-valuemin="0" aria-valuemax="${t}" aria-valuenow="${n}"><span style="width:${t?n/t*100:0}%"></span></div>
    ${k.run.problem?`<p class="notice notice--stop" role="alert">${S(k.run.problem)}</p>`:``}
    ${k.storageFull?`<p class="notice notice--stop" role="alert">This browser has no room left to save the study. Labels will be lost when the page closes.</p>`:``}
    ${s}${l}`;for(let[e,t]of[[`progress`,`<p><button class="linkbtn" type="button" data-action="change-themes">Change the themes</button><br /><button class="linkbtn" type="button" data-action="discard">Start a new study</button></p>`],[`progress-narrow`,``]]){let n=document.getElementById(e);if(!n)continue;let r=P(n);n.innerHTML=u+t,r()}}var Le={all:`All answers`,none:`No theme`,flag:`Safety reports`},Re=window.matchMedia(`(max-width: 62rem)`);function ze(e){k.pane=e,C(`.work`).dataset.pane=e,O.querySelectorAll(`.tabs button`).forEach(t=>t.setAttribute(`aria-current`,String(t.dataset.pane===e))),Re.matches&&C(`.tabs`).scrollIntoView({block:`start`})}function Be(){let e=k.filter;return e===`all`?k.study.answers:k.study.answers.filter(t=>{let n=t.reading;return!n||n.failed?!1:e===`none`?n.themes.length===0:e===`flag`?n.flag:n.themes.includes(e)})}function Ve(e){let t=e.reading,n=k.open.has(e.id)||!!t?.failed,r=n?`<p class="slip__original">${S(e.text)}</p>`:``,i=`<button class="linkbtn" type="button" data-action="original" data-id="${e.id}" aria-expanded="${n}">${n?`Hide the original`:`Show the original`}</button>`;if(!t)return`<li class="slip" id="slip-${e.id}"><p class="slip__text slip__text--waiting">Waiting to be read</p>${r}<div class="slip__meta"><span class="slip__actions">${i}</span></div></li>`;let a=k.editing.has(e.id),o=new Map(k.study.themes.map(e=>[e.id,e.name])),s=c(t.gist,e.text,k.study.themes.map(e=>e.name)),l=t.failed?`The local model could not label this answer. Label it by hand.`:t.gist||`No gist was written for this answer.`,u=e.shareGist&&s.ok?`<span class="marked">${S(l)}</span>`:S(l),d=a?k.study.themes.map(n=>`<button class="circled" type="button" data-action="toggle-theme" data-id="${e.id}" data-theme="${n.id}" aria-pressed="${t.themes.includes(n.id)}">${S(n.name)}</button>`).join(``)+`<button class="stamp" type="button" data-action="toggle-flag" data-id="${e.id}" aria-pressed="${t.flag}">Safety report</button>`:(t.themes.map(e=>`<span class="circled">${S(o.get(e)??e)}</span>`).join(``)||`<span class="tone">no theme</span>`)+`<span class="tone">${S(t.sentiment)}</span>${t.flag?`<span class="stamp">Safety report</span>`:``}${t.edited?`<span class="tone">changed by you</span>`:``}`,f=a&&!t.failed?`<label class="share"><input type="checkbox" data-change="share" data-id="${e.id}" ${e.shareGist&&s.ok?`checked`:``} ${s.ok?``:`disabled`} /><span>The cloud may see this gist as an example</span>${s.ok?``:`<span class="share__why">${S(s.reason)}</span>`}</label>`:``;return`<li class="slip" id="slip-${e.id}">
    <p class="slip__text${t.failed?` slip__text--waiting`:``}">${u}</p>${r}
    <div class="slip__meta">${d}<span class="slip__actions">${i}<button class="linkbtn" type="button" data-action="edit" data-id="${e.id}" aria-expanded="${a}">${a?`Done`:`Change labels`}</button></span></div>${f}
  </li>`}function G(){let e=C(`#pane-answers`);if(!e)return;let t=P(e),n=Be();e.innerHTML=`
    <div class="answers__bar"><h2 tabindex="-1">${S(Le[k.filter]??k.study.themes.find(e=>e.id===k.filter)?.name??`Answers`)}</h2><span class="hint">${w(n.length,`answer`)}</span></div>
    <div class="progress only-narrow" id="progress-narrow"></div>
    ${n.length?`<ul class="slips">${n.map(Ve).join(``)}</ul>`:`<p class="empty">${k.filter===`flag`?`No safety reports so far.`:`No answers here yet.`}</p>`}`,W(),t()}function K(e){let t=document.getElementById(`slip-${e.id}`),n=Be().includes(e);if(t&&n){let n=P(t.parentElement);t.outerHTML=Ve(e),n()}else(t||n)&&G()}function q(){let e=C(`#sheet-block`);if(!e)return;let t=k.study,n=P(e),r=!!C(`#exact`,e)?.open,i=de(t),a=``,o=``;try{a=De(h(i,t).bytes)}catch(e){o=e.message}let s=[...i.tallies.map(e=>[e.theme,e.answers]),[`No theme`,i.answers_with_no_theme],[`Safety reports`,i.safety_reports]].map(([e,t])=>`<tr><th scope="row">${S(e)}</th><td>${t}</td></tr>`).join(``),c=i.approved_gists?.length??0,l=Ae();e.innerHTML=`
    <h2>Leaves this computer</h2>
    <div class="sheet">
      <table><tbody>${s}</tbody></table>
      <p class="sheet__size">${i.answers_read} of ${w(i.answers_received,`answer`)} counted${c?`, with ${w(c,`gist`)} you approved`:``}. ${a?`${a} with your question and theme names.`:``}</p>
      <details id="exact" ${r?`open`:``}><summary>See the exact text</summary><pre>${S(m(i))}</pre></details>
    </div>
    <div class="sheet__send">
      ${o?`<p class="problem" role="alert">${S(o)}</p>`:``}
      <button class="btn btn--primary" type="button" data-action="write-report" ${i.answers_read===0||o?`disabled`:``} ${k.report.busy?`aria-disabled="true"`:``}>${l?`Send the counts and write the report`:`Summarise the counts here`}</button>
      ${l?``:`<p class="hint">${k.online?`The cloud is not connected, so nothing will be sent.`:`This computer is offline, so nothing will be sent.`}</p>`}
      ${k.report.problem?`<p class="problem" role="alert">${S(k.report.problem)}</p>`:``}
    </div>`,n()}function He(e){let t=j[e.reason]??`the cloud could not be used`,n=`Written in the cloud from the counts above.`;return e.source===`on_device`?n=`Put together on this computer because ${t}. The local model chose which counts to lead with. Every sentence is taken from the counts, and nothing was sent.`:e.source===`page`&&(n=`Put together by this page because ${t} and this browser has no local model. Every sentence is taken from the counts, and nothing was sent.`),e.shortened?`${n} Shortened ${N(e.shortened)}.`:n}function J(){let e=C(`#report`);if(!e)return;let t=P(e),n=k.study.report;e.innerHTML=k.report.busy?`<h2>Report</h2><div class="report__body" aria-live="polite">${k.report.live?D(k.report.live):`<p class="hint">Writing.</p>`}</div>`:n?`
      <h2>Report</h2>
      <div class="report__body">${D(n.text)}</div>
      <p class="report__source" role="status">${S(He(n))}</p>
      <div class="report__actions">
        ${n.source===`in_cloud`?`<button class="linkbtn" type="button" data-action="shorten">Shorten</button>`:``}
        <button class="linkbtn" type="button" data-action="copy">Copy</button>
        <button class="linkbtn" type="button" data-action="print">Print</button>
      </div>`:``,t()}function Y(){let e=C(`#audit`);if(!e||!k.study)return;let t=k.study.answers.filter(e=>e.reading),n=t.filter(e=>e.reading.source===`in_cloud`).length,r=[],i=t.filter(e=>e.reading.source===`recorded`).length;i&&r.push(`<li>${w(i,`answer`)}: labels recorded on another computer on ${Se}, not read in this browser</li>`),t.length>i&&r.push(`<li>${w(t.length-i-n,`answer`)} read on this computer, ${n} in the cloud<br /><code>${k.study.confidential?`only_on_device`:`prefer_on_device`}</code></li>`);for(let e of k.study.steps??[]){let t=e.error?`no model ran, because ${S(j[e.error]??`of an error`)}`:`${N(e.source)}${e.fallback?`, because ${S(j[e.fallback.reason]??`the other path was not available`)}`:``}`;r.push(`<li>${S(e.label)}: ${t}<br /><code>${S(e.mode)}</code> <span class="hint">${(e.ms/1e3).toFixed(1)} s</span></li>`)}e.innerHTML=`<summary>Where each step ran</summary>${r.length?`<ol>${r.join(``)}</ol>`:`<p class="hint">Nothing has run yet.</p>`}`}async function Ue(){let t=k.study;if(!k.run.active){k.run={active:!0,stop:!1,problem:``},W();try{if(k.device=await e(),se(k.device)){k.device=`downloading`,R(),W();let e=A.prepareDevice(e=>{k.download=e,R(),W()}).then(z);t.confidential?await e:e.catch(()=>{})}R(),await ae({study:t,router:A,shouldStop:()=>k.run.stop||k.study!==t,onReading(e){L(),K(e),U(),q(),Y()}})}catch(e){k.run.problem=M(e),z(),U(),G(),q()}k.run.active=!1,k.run.stop=!1,I(),W()}}async function We(){let e=k.study;if(k.report.busy)return;let t=de(e);try{h(t,e)}catch(e){return k.report.problem=e.message,q()}k.report={busy:!0,live:``,problem:``},q(),J();let n=b(t);try{let r=await A.run(`report`,{prompt:pe(t),system:fe,devicePrompt:ve(t,n),deviceSystem:_e,deviceSchema:ye(n),deviceOnChunk:null,onChunk(e,t){k.report.live=t,J()}});e.report={text:r.source===`on_device`?xe(t,be(r.text,n)):r.text.trim(),source:r.source,reason:r.fallback?.reason??null,at:r.at,shortened:null},I()}catch(n){n?.code===`no-path`?(e.report={text:xe(t),source:`page`,reason:n.detail?.cloud??null,at:new Date().toISOString(),shortened:null},I()):k.report.problem=M(n)}k.report.busy=!1,k.report.live=``,q(),J()}async function Ge(){let e=k.study;if(e.report&&!k.report.busy){k.report={busy:!0,live:``,problem:``},J();try{let t=await A.run(`shorten`,{prompt:me(e.report.text),onChunk(e,t){k.report.live=t,J()}});e.report={...e.report,text:t.text.trim(),shortened:t.source},I()}catch(e){k.report.problem=M(e)}k.report.busy=!1,k.report.live=``,q(),J()}}function X(e){return k.study?.answers.find(t=>t.id===e)}function Ke(e){e.reading.edited=!0,L(),K(e),U(),q()}var qe={sample(){k.study=ee(),I(),$()},"add-theme"(){k.study.themes.push({name:``,definition:``}),H(),O.querySelector(`.theme-row:last-child input`)?.focus()},"remove-theme"(e){k.study.themes.splice(Number(e.dataset.index),1),L(),H()},"suggest-question":()=>Ne(`question`),"suggest-sample":()=>Ne(`sample`),"start-reading":Pe,discard(){window.confirm(`Remove this study from this browser? The answers and their labels are not stored anywhere else.`)&&(k.run.active&&(k.run.stop=!0),ne(),Object.assign(k,{study:null,filter:`all`,open:new Set,editing:new Set,lastCounts:{},frameProblem:``,intakeProblem:``,suggest:{busy:!1,note:``,problem:``},report:{busy:!1,live:``,problem:``}}),$())},"change-themes"(){if(!window.confirm(`Changing the themes clears the labels and the report. The answers stay.`))return;let e=k.study;k.run.active&&(k.run.stop=!0),e.answers.forEach(e=>{e.reading=null,e.shareGist=!1}),e.report=null,e.started=!1,k.lastCounts={},k.filter=`all`,I(),$()},tab(e){ze(e.dataset.pane)},filter(e){k.filter=e.dataset.key,U(),G(),C(`#pane-answers`).scrollTop=0,Re.matches&&(ze(`answers`),Q(C(`#pane-answers`)))},read:Ue,recorded(){let e=k.study;x(e)&&(Ee().forEach((t,n)=>{e.answers[n].reading=t}),k.run.problem=``,I(),Fe(),Q())},pause(){k.run.stop=!0,W()},original(e){let t=e.dataset.id;k.open.has(t)?k.open.delete(t):k.open.add(t),K(X(t))},edit(e){let t=e.dataset.id;k.editing.has(t)?k.editing.delete(t):k.editing.add(t),K(X(t))},"toggle-theme"(e){let t=X(e.dataset.id),n=e.dataset.theme,r=t.reading.themes;t.reading.themes=r.includes(n)?r.filter(e=>e!==n):[...r,n],t.reading.failed=!1,Ke(t)},"toggle-flag"(e){let t=X(e.dataset.id);t.reading.flag=!t.reading.flag,Ke(t)},"write-report":We,shorten:Ge,async copy(e){await navigator.clipboard.writeText(k.study.report.text),e.textContent=`Copied`,setTimeout(()=>{e.textContent=`Copy`},1800)},print:()=>window.print()};O.addEventListener(`click`,e=>{let t=e.target.closest(`[data-action]`);t&&!t.disabled&&qe[t.dataset.action]?.(t)}),O.addEventListener(`submit`,e=>{e.preventDefault(),e.target.dataset.form===`intake`&&V(e.target.elements.paste.value)}),O.addEventListener(`input`,e=>{let{input:t,index:n}=e.target.dataset,r=k.study;t&&r&&(t===`theme-name`?r.themes[Number(n)].name=e.target.value:t===`theme-definition`?r.themes[Number(n)].definition=e.target.value:r[t]=e.target.value,t===`title`&&(C(`#study-title`).textContent=r.title),L())}),O.addEventListener(`change`,async e=>{let t=e.target.dataset.change;if(t===`file`){let t=e.target.files?.[0];t&&V(await t.text(),t.name.replace(/\.[^.]+$/,``))}else if(t===`confidential`)k.study.confidential=e.target.checked,C(`#confidential-hint`).textContent=je(e.target.checked),L();else if(t===`share`){let t=X(e.target.dataset.id);t.shareGist=e.target.checked&&c(t.reading.gist,t.text,k.study.themes.map(e=>e.name)).ok,L(),K(t),q()}});for(let e of[`online`,`offline`])window.addEventListener(e,()=>{k.online=navigator.onLine,R(),q()});document.addEventListener(`visibilitychange`,()=>{!document.hidden&&!k.run.active&&z()}),window.addEventListener(`pagehide`,I);var Z=null;function Q(e=O){[...e.querySelectorAll(`h1, h2`)].find(e=>e.offsetParent!==null)?.focus({preventScroll:!0})}function $(){R();let e=k.study?k.study.started?`work`:`frame`:`start`;e===`start`?B():e===`frame`?H():Fe(),Z!==e&&(window.scrollTo(0,0),Z&&Q()),Z=e}$(),z();