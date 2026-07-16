const $ = (id) => document.getElementById(id);
const screens = {
  start:$("start-screen"), quiz:$("quiz-screen"), result:$("result-screen"), admin:$("admin-screen")
};

const STORAGE_KEY = "llmTuringTestResultsV1";
const ADMIN_PASSWORD = "0717";
const EXPERIMENT_SIZE = 8;

let participant = {name:""};
let trials = [];
let answers = [];
let index = 0;
let trialStartedAt = 0;
let timerId = null;
let returnScreen = "start";

function showScreen(name){
  Object.values(screens).forEach(s=>s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function createTrials(){
  const selectedQuestions = [];

  QUESTION_CATEGORIES.forEach(category=>{
    const pool = shuffle(
      QUESTION_DATA.filter(q=>q.category===category)
    );

    if(pool.length < 2){
      throw new Error(`${category} 유형에는 최소 2개의 질문이 필요합니다.`);
    }

    selectedQuestions.push(pool[0], pool[1]);
  });

  const sourceSchedule = shuffle([
    "ChatGPT", "ChatGPT",
    "Gemini", "Gemini",
    "Claude", "Claude",
    "Human", "Human"
  ]);

  const result = selectedQuestions.map((q, i)=>{
    const source = sourceSchedule[i];

    return {
      trialId:`${q.id}_${source}`,
      questionId:q.id,
      category:q.category,
      question:q.question,
      response:q.responses[source],
      actualSource:source,
      actualType:SOURCE_INFORMATION[source].type
    };
  });

  return shuffle(result);
}

function selectedJudgment(){
  return document.querySelector('input[name="judgment"]:checked')?.value || null;
}

function resetInputs(){
  document.querySelectorAll('input[name="judgment"]').forEach(x=>x.checked=false);
  $("confidence").value=3;
  $("confidence-value").textContent="3";
  $("judgment-reason").value="";
  $("quiz-error").textContent="";
}

function startTimer(){
  trialStartedAt=performance.now();
  clearInterval(timerId);
  timerId=setInterval(()=>{
    $("elapsed-time").textContent=((performance.now()-trialStartedAt)/1000).toFixed(1)+"초";
  },100);
}

function displayTrial(){
  const t=trials[index];
  $("current-question").textContent=index+1;
  $("total-questions").textContent=trials.length;
  $("progress-bar").style.width=`${((index+1)/trials.length)*100}%`;
  $("question-category").textContent=t.category;
  $("question-text").textContent=t.question;
  $("response-text").textContent=t.response;
  $("next-button").textContent=index===trials.length-1?"실험 결과 확인":"다음 문항";
  resetInputs();
  startTimer();
}

function startExperiment(e){
  e.preventDefault();

  const name = $("participant-name").value.trim();

  if(!name){
    $("start-error").textContent =
      "참가자 이름 또는 별명을 입력해 주세요.";
    return;
  }

  participant = {name};

  try{
    trials = createTrials();
  }catch(error){
    $("start-error").textContent = error.message;
    return;
  }

  if(trials.length !== EXPERIMENT_SIZE){
    $("start-error").textContent =
      "실험 문항을 구성하는 과정에서 오류가 발생했습니다.";
    return;
  }

  answers = [];
  index = 0;
  $("start-error").textContent = "";

  showScreen("quiz");
  displayTrial();
}

function saveAnswer(){
  const judgment=selectedJudgment();
  if(!judgment){$("quiz-error").textContent="사람 또는 인공지능 중 하나를 선택해 주세요.";return false;}
  const t=trials[index];
  const responseTime=((performance.now()-trialStartedAt)/1000);
  answers.push({
    participantName:participant.name,
    questionNumber:index+1,
    trialId:t.trialId,
    questionId:t.questionId,
    category:t.category,
    question:t.question,
    response:t.response,
    actualSource:t.actualSource,
    actualType:t.actualType,
    participantJudgment:judgment,
    correct:judgment===t.actualType,
    confidence:Number($("confidence").value),
    reason:$("judgment-reason").value || "미선택",
    responseTimeSeconds:Number(responseTime.toFixed(2)),
    answeredAt:new Date().toISOString()
  });
  return true;
}

function groupStats(rows,key){
  const map={};
  rows.forEach(r=>{
    const k=r[key];
    if(!map[k])map[k]={total:0,correct:0,human:0,time:0,confidence:0};
    map[k].total++;
    map[k].correct+=r.correct?1:0;
    map[k].human+=r.participantJudgment==="Human"?1:0;
    map[k].time+=Number(r.responseTimeSeconds);
    map[k].confidence+=Number(r.confidence);
  });
  return map;
}

function pct(n,d){return d?Math.round((n/d)*1000)/10:0}
function avg(n,d){return d?Math.round((n/d)*100)/100:0}

function calculateResult(rows){
  const total=rows.length;
  const correct=rows.filter(r=>r.correct).length;
  return {
    total,correct,accuracy:pct(correct,total),
    avgConfidence:avg(rows.reduce((s,r)=>s+r.confidence,0),total),
    avgTime:avg(rows.reduce((s,r)=>s+r.responseTimeSeconds,0),total),
    aiMistaken:rows.filter(r=>r.actualType==="AI"&&r.participantJudgment==="Human").length,
    humanMistaken:rows.filter(r=>r.actualType==="Human"&&r.participantJudgment==="AI").length,
    byCategory:groupStats(rows,"category"),
    bySource:groupStats(rows,"actualSource")
  };
}

function tableHtml(title,stats,kind){
  const rows=Object.entries(stats).map(([name,d])=>{
    const accuracy=pct(d.correct,d.total);
    const humanRate=pct(d.human,d.total);
    return `<tr><td>${name}</td><td>${d.total}</td><td>${accuracy}%</td><td>${humanRate}%</td><td>${avg(d.confidence,d.total)}</td><td>${avg(d.time,d.total)}초</td></tr>`;
  }).join("");
  return `<h3>${title}</h3><table><thead><tr><th>${kind}</th><th>판단 수</th><th>정확도</th><th>사람 판정률</th><th>평균 확신도</th><th>평균 시간</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function autoAnalysis(result){
  const categoryEntries=Object.entries(result.byCategory).map(([k,d])=>({name:k,accuracy:pct(d.correct,d.total),humanRate:pct(d.human,d.total)}));
  const sourceEntries=Object.entries(result.bySource).filter(([k])=>k!=="Human").map(([k,d])=>({name:k,humanRate:pct(d.human,d.total)}));
  const hardest=[...categoryEntries].sort((a,b)=>a.accuracy-b.accuracy)[0];
  const easiest=[...categoryEntries].sort((a,b)=>b.accuracy-a.accuracy)[0];
  const mostHuman=[...sourceEntries].sort((a,b)=>b.humanRate-a.humanRate)[0];
  return `${participant.name} 참가자는 총 ${result.total}문항 중 ${result.correct}문항을 정확히 구분하여 정확도는 ${result.accuracy}%였다. 질문 유형별로는 ${hardest.name}에서 구분 정확도가 가장 낮았고, ${easiest.name}에서 가장 높았다. 생성형 AI 가운데 ${mostHuman.name}의 응답이 사람으로 판단된 비율이 가장 높았다. 평균 확신도는 5점 만점에 ${result.avgConfidence}점, 평균 응답 시간은 ${result.avgTime}초였다. 이 결과는 자연스러운 언어 생성 능력과 실제 인간의 사고 능력을 동일하게 볼 수 있는지 추가 검토가 필요함을 보여 준다.`;
}

function finishExperiment(){
  clearInterval(timerId);
  const result=calculateResult(answers);
  $("result-participant").textContent=`${participant.name} 참가자`;
  $("score-percent").textContent=`${result.accuracy}%`;
  $("result-total").textContent=result.total;
  $("result-correct").textContent=result.correct;
  $("average-confidence").textContent=result.avgConfidence;
  $("average-time").textContent=result.avgTime+"초";
  $("auto-analysis").textContent=autoAnalysis(result);
  $("category-results").innerHTML=tableHtml("질문 유형별 분석",result.byCategory,"질문 유형");
  $("source-results").innerHTML=tableHtml("출처별 분석",result.bySource,"실제 출처");
  saveSession();
  showScreen("result");
}

function nextTrial(){
  if(!saveAnswer())return;
  if(index===trials.length-1){finishExperiment();return;}
  index++;
  displayTrial();
}

function getStored(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return []}
}

function saveSession(){
  const all=getStored();
  all.push({
    sessionId:`${participant.name}_${Date.now()}`,
    participant,
    completedAt:new Date().toISOString(),
    answers
  });
  localStorage.setItem(STORAGE_KEY,JSON.stringify(all));
}

function csvEscape(value){
  const s=String(value??"");
  return `"${s.replaceAll('"','""')}"`;
}

function downloadCsv(filename,rows){
  if(!rows.length){alert("다운로드할 데이터가 없습니다.");return;}
  const headers=Object.keys(rows[0]);
  const csv=[headers.join(","),...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))].join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;a.click();
  URL.revokeObjectURL(url);
}

function flattenSessions(sessions){
  return sessions.flatMap(s=>s.answers.map(a=>({...a,sessionId:s.sessionId,completedAt:s.completedAt})));
}

function renderBars(containerId,stats,valueFn){
  const container=$(containerId);
  container.innerHTML=Object.entries(stats).map(([name,d])=>{
    const value=valueFn(d);
    return `<div class="bar-row"><div class="bar-label">${name}</div><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><div class="bar-value">${value}%</div></div>`;
  }).join("");
}

function renderAdmin(){
  const sessions=getStored();
  const rows=flattenSessions(sessions);
  const result=calculateResult(rows);
  $("admin-participants").textContent=sessions.length;
  $("admin-judgments").textContent=rows.length;
  $("admin-accuracy").textContent=result.accuracy+"%";
  const aiRows=rows.filter(r=>r.actualType==="AI");
  $("admin-fool-rate").textContent=pct(aiRows.filter(r=>r.participantJudgment==="Human").length,aiRows.length)+"%";
  renderBars("source-chart",result.bySource,d=>pct(d.human,d.total));
  renderBars("category-chart",result.byCategory,d=>pct(d.correct,d.total));
  renderSessionList(sessions);
  $("admin-table").innerHTML=rows.length?tableHtml("전체 질문 유형별 분석",result.byCategory,"질문 유형"):"<p>저장된 실험 결과가 없습니다.</p>";
}


function verifyAdminPassword(){
  const entered = prompt("관리자 비밀번호를 입력하세요.");

  if(entered === null){
    return false;
  }

  if(entered !== ADMIN_PASSWORD){
    alert("비밀번호가 올바르지 않습니다.");
    return false;
  }

  return true;
}

function deleteSession(sessionId){
  const sessions = getStored();
  const session = sessions.find(item=>item.sessionId===sessionId);

  if(!session){
    alert("해당 참가자 결과를 찾을 수 없습니다.");
    return;
  }

  const name = session.participant?.name || "이름 없음";

  if(!confirm(`${name} 참가자의 실험 결과를 삭제하시겠습니까?`)){
    return;
  }

  const updated = sessions.filter(item=>item.sessionId!==sessionId);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(updated));

  renderAdmin();
}

function renderSessionList(sessions){
  const container = $("admin-session-list");

  if(!sessions.length){
    container.innerHTML = "<h3>참가자별 결과 관리</h3><p>저장된 참가자 결과가 없습니다.</p>";
    return;
  }

  const rows = sessions.map((session,index)=>{
    const result = calculateResult(session.answers || []);
    const name = session.participant?.name || "이름 없음";
    const completed = session.completedAt
      ? new Date(session.completedAt).toLocaleString("ko-KR")
      : "-";

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${name}</td>
        <td>${result.total}</td>
        <td>${result.accuracy}%</td>
        <td>${result.avgConfidence}</td>
        <td>${result.avgTime}초</td>
        <td>${completed}</td>
        <td>
          <button
            class="delete-session-button"
            type="button"
            data-session-id="${session.sessionId}"
          >
            개별 삭제
          </button>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <h3>참가자별 결과 관리</h3>
    <table>
      <thead>
        <tr>
          <th>순서</th>
          <th>참가자</th>
          <th>문항 수</th>
          <th>정확도</th>
          <th>평균 확신도</th>
          <th>평균 시간</th>
          <th>완료 시각</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="password-note">개별 삭제 후 관리자 통계가 자동으로 다시 계산됩니다.</p>
  `;

  container.querySelectorAll(".delete-session-button").forEach(button=>{
    button.addEventListener("click",()=>{
      deleteSession(button.dataset.sessionId);
    });
  });
}

function openAdmin(from){
  if(!verifyAdminPassword()){
    return;
  }

  returnScreen=from;
  renderAdmin();
  showScreen("admin");
}

function templateRows(){
  return QUESTION_DATA.flatMap(q=>["ChatGPT","Gemini","Claude","Human"].map(source=>({
    questionId:q.id,category:q.category,question:q.question,source,response:q.responses[source]
  })));
}

$("participant-form").addEventListener("submit",startExperiment);
$("next-button").addEventListener("click",nextTrial);
$("confidence").addEventListener("input",e=>$("confidence-value").textContent=e.target.value);
$("download-csv").addEventListener("click",()=>downloadCsv(`participant_${participant.name}.csv`,answers));
$("restart-button").addEventListener("click",()=>{showScreen("start");$("participant-name").value=""});
$("open-admin").addEventListener("click",()=>openAdmin("start"));
$("result-admin").addEventListener("click",()=>openAdmin("result"));
$("admin-close").addEventListener("click",()=>showScreen(returnScreen));
$("download-all-csv").addEventListener("click",()=>downloadCsv("all_turing_test_results.csv",flattenSessions(getStored())));
$("download-template").addEventListener("click",()=>downloadCsv("response_template.csv",templateRows()));
$("clear-data").addEventListener("click",()=>{
  if(confirm("저장된 모든 실험 데이터를 삭제하시겠습니까?")){
    localStorage.removeItem(STORAGE_KEY);renderAdmin();
  }
});

showScreen("start");
