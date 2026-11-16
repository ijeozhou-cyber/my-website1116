/**
 * OPC 周报系统 - 主逻辑
 * 数据存储：浏览器 localStorage（key: opc-weekly-v3）
 */

const store = {
  get(){
    try{
      if(typeof localStorage==='undefined')return {};
      return JSON.parse(localStorage.getItem('opc-weekly-v3')||'{}');
    }catch(e){ if(window.__storageBlocked!==true){window.__storageBlocked=true; showStorageTip();} return {}; }
  },
  set(d){
    try{
      if(typeof localStorage==='undefined'){ if(!window.__storageBlocked){window.__storageBlocked=true; showStorageTip();} return; }
      localStorage.setItem('opc-weekly-v3',JSON.stringify(d));
    }catch(e){ if(!window.__storageBlocked){window.__storageBlocked=true; showStorageTip();} }
  }
};
function showStorageTip(){
  const el=document.getElementById('storage-tip');
  if(el){el.style.display='block';}
}
let role='team', currentTeam=null;

function getWeekKey(){
  const d=new Date();
  const day=(d.getDay()+6)%7; // Monday=0
  const monday=new Date(d); monday.setDate(d.getDate()-day); monday.setHours(0,0,0,0);
  const y=monday.getFullYear();
  const jan1=new Date(y,0,1);
  const week=Math.floor((monday-jan1)/(7*864e5))+1;
  return {key:`${y}-W${String(week).padStart(2,'0')}`, monday};
}
const WK=getWeekKey();
const fmtDate=d=>`${d.getMonth()+1}月${d.getDate()}日`;

function isBefore(h,m){const n=new Date();return n.getHours()<h||(n.getHours()===h&&n.getMinutes()<m);}
const planOpen = ()=>{const day=(new Date().getDay()+6)%7; return day===0 && isBefore(22,0);};
const progOpen = ()=>{const day=(new Date().getDay()+6)%7; return day<=3 && isBefore(22,0);};

function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}

function renderWeekBanner(){
  const data=store.get(), w=data[WK.key]||{}, mine=w[currentTeam];
  const planDone=!!(mine&&mine.plan), progDone=!!(mine&&mine.progress);
  const day=(new Date().getDay()+6)%7;
  const dayName=['周一','周二','周三','周四','周五','周六','周日'][day];
  document.getElementById('week-label').textContent=`${WK.key} · 今天是${dayName} ${fmtDate(new Date())}`;
  let task='本周期内暂无需提交，可查看历史记录';
  if(day===0) task= planDone?'✅ 本周计划已提交':'📌 今日任务：提交本周计划（22:00 截止）';
  else if(day<=3) task= progDone?'✅ 本周进度已提交':'📊 周四任务：提交进度安排（周四 22:00 截止）';
  document.getElementById('task-label').textContent=task;
  document.getElementById('team-sub-count').textContent=(planDone?1:0)+(progDone?1:0);
  document.getElementById('deadline-label').textContent=`计划截止 周一 22:00 · 进度截止 周四 22:00`;
  document.getElementById('plan-status').innerHTML = planDone
    ? `✅ 已于 <b>${mine.plan.at}</b> 提交 <button class="btn btn-outline btn-sm" onclick="editAgain('plan')">重新填写</button>`
    : '⏳ 本周尚未提交计划';
  document.getElementById('prog-status').innerHTML = progDone
    ? `✅ 已于 <b>${mine.progress.at}</b> 提交 <button class="btn btn-outline btn-sm" onclick="editAgain('progress')">重新填写</button>`
    : '⏳ 周四 22:00 前提交';
  renderHistory();
}

function renderChips(){
  const el=document.getElementById('team-chips');
  el.innerHTML=TEAMS.map(t=>`<span class="chip ${t===currentTeam?'on':''}" onclick="pickTeam('${t}')">${t}</span>`).join('');
}
function pickTeam(t){currentTeam=t;renderAll();toast(`已切换身份：${t}`);}

function renderHistory(){
  const data=store.get(), el=document.getElementById('my-history');
  const rows=[];
  Object.keys(data).sort().reverse().forEach(wk=>{
    const mine=data[wk][currentTeam]; if(!mine)return;
    if(mine.plan) rows.push(`<div class="history-item"><b>${wk} · 周一计划</b>（${mine.plan.at} 提交）<br>任务：${esc(mine.plan.tasks)}<br>目标：${esc(mine.plan.goal)}${mine.plan.need?`<br>需要的支持：${esc(mine.plan.need)}`:''}</div>`);
    if(mine.progress) rows.push(`<div class="history-item" style="border-color:var(--green)"><b>${wk} · 周四进度</b>（${mine.progress.at} 提交）<br>完成度：${mine.progress.p1}% / ${mine.progress.p2}%<br>成果：${esc(mine.progress.result)}${mine.progress.delay?`<br>补救安排：${esc(mine.progress.delay)}`:''}</div>`);
  });
  el.innerHTML = rows.length?rows.join(''):'<div class="empty">暂无提交记录——先在上方选择团队并提交一份周计划试试</div>';
}
const esc=s=>(s||'').replace(/</g,'&lt;');

function submitForm(type){
  if(!currentTeam){toast('请先选择你的团队');return;}
  if(type==='plan'){
    const tasks=document.getElementById('plan-tasks').value.trim();
    if(!tasks){toast('请填写本周核心任务');return;}
    const rec={tasks,goal:document.getElementById('plan-goal').value.trim(),need:document.getElementById('plan-need').value.trim(),at:nowStr()};
    save(type,rec); document.getElementById('plan-tasks').value='';document.getElementById('plan-goal').value='';document.getElementById('plan-need').value='';
    toast('本周计划已提交 ✔');
  }else{
    const p1=Math.max(0,Math.min(100,parseInt(document.getElementById('prog-p1').value)||0));
    const p2=Math.max(0,Math.min(100,parseInt(document.getElementById('prog-p2').value)||0));
    const result=document.getElementById('prog-result').value.trim();
    if(!result){toast('请填写实际成果与亮点');return;}
    const rec={p1,p2,result,delay:document.getElementById('prog-delay').value.trim(),at:nowStr()};
    save(type,rec); document.getElementById('prog-result').value='';document.getElementById('prog-delay').value='';document.getElementById('prog-p1').value='';document.getElementById('prog-p2').value='';
    toast('进度安排已提交 ✔');
  }
  renderAll();
}
function save(type,rec){
  const data=store.get(); data[WK.key]=data[WK.key]||{};
  data[WK.key][currentTeam]=data[WK.key][currentTeam]||{};
  data[WK.key][currentTeam][type]=rec; store.set(data);
}
function editAgain(type){
  const data=store.get(), rec=data[WK.key]&&data[WK.key][currentTeam]&&data[WK.key][currentTeam][type];
  if(!rec)return;
  if(type==='plan'){document.getElementById('plan-tasks').value=rec.tasks;document.getElementById('plan-goal').value=rec.goal;document.getElementById('plan-need').value=rec.need||'';}
  else{document.getElementById('prog-p1').value=rec.p1;document.getElementById('prog-p2').value=rec.p2;document.getElementById('prog-result').value=rec.result;document.getElementById('prog-delay').value=rec.delay||'';}
  toast('已填入原内容，修改后再次提交即可覆盖');
}
function nowStr(){const d=new Date();return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}

/* ---------- 管理端 ---------- */
function seedDemo(){
  const data=store.get();
  if(data[WK.key]&&Object.keys(data[WK.key]).length>0)return;
  data[WK.key]={};
  const goals=['完成校园地推 3 场','上架新品 2 款','直播 4 场','新增会员 50 人','对接 2 家供应商','优化包装设计','开展问卷调研','拍摄短视频 5 条'];
  TEAMS.forEach((t,i)=>{
    if(i%4===3)return; // 模拟约 1/4 团队未交
    const p1=60+Math.round(Math.random()*40),p2=50+Math.round(Math.random()*50);
    data[WK.key][t]={
      plan:{tasks:goals[i%goals.length]+'\n维护社群日常运营',goal:goals[(i+2)%goals.length],need:'',at:'周一 10:'+String(10+i%45).padStart(2,'0')},
      progress:(i%3!==2)?{p1,p2,result:'按计划推进，已达成阶段性成果',delay:i%5===0?'部分事项顺延至下周':''}:{}
    };
  });
  store.set(data);
}

function renderAdmin(){
  const data=store.get(), w=data[WK.key]||{};
  let planN=0,progN=0,lateN=0,avgSum=0,avgN=0;
  const rows=TEAMS.map(t=>{
    const r=w[t]||{};
    const hasPlan=!!r.plan, hasProg=!!r.progress;
    if(hasPlan)planN++; if(hasProg)progN++;
    const isLate=x=>x&&x.at&&/1[3-9]:|2[0-3]:|2[0-3]时|22:|23:/.test(x.at)&&!/0:\d|10:|11:|12:/.test(x.at);
    if(!hasPlan||!hasProg)lateN++;
    let avg='—';
    if(hasProg){avg=Math.round((r.progress.p1+r.progress.p2)/2);avgSum+=avg;avgN++;}
    return {t,hasPlan,hasProg,avg,r};
  });
  document.getElementById('stat-plan').textContent=planN;
  document.getElementById('bar-plan').style.width=(planN/TEAMS.length*100)+'%';
  document.getElementById('stat-prog').textContent=progN;
  document.getElementById('bar-prog').style.width=(progN/TEAMS.length*100)+'%';
  document.getElementById('stat-avg').textContent=avgN?Math.round(avgSum/avgN):'—';
  document.getElementById('bar-avg').style.width=avgN?Math.round(avgSum/avgN)+'%':'0%';
  document.getElementById('stat-late').textContent=lateN;
  document.getElementById('bar-late').style.width=(lateN/TEAMS.length*100)+'%';
  document.getElementById('board-week').textContent='（'+WK.key+'）';
  document.getElementById('admin-tbody').innerHTML=rows.map(r=>`
    <tr>
      <td><b style="font-weight:500">${r.t}</b></td>
      <td>${r.hasPlan?'<span class="tag tag-ok">已交</span>':'<span class="tag tag-no">未交</span>'}</td>
      <td>${r.hasProg?'<span class="tag tag-ok">已交</span>':'<span class="tag tag-no">未交</span>'}</td>
      <td>${r.avg==='—'?'—':r.avg+'%'}</td>
      <td><button class="btn btn-outline btn-sm" onclick='showDetail(${JSON.stringify(r.t)})'>查看</button></td>
    </tr>`).join('');
}

function showDetail(t){
  const data=store.get(), r=(data[WK.key]||{})[t]||{};
  let html='';
  if(r.plan) html+=`<p style="font-size:13px;line-height:1.8"><b>📌 周一计划</b>（${r.plan.at}）<br>任务：${esc(r.plan.tasks).replace(/\n/g,'<br>')}<br>目标：${esc(r.plan.goal)}${r.plan.need?`<br>需要的支持：${esc(r.plan.need)}`:''}</p>`;
  else html+='<p style="font-size:13px;color:var(--red)">📌 周一计划：未提交</p>';
  if(r.progress) html+=`<p style="font-size:13px;line-height:1.8;margin-top:10px"><b>📊 周四进度</b>（${r.progress.at}）<br>完成度：任务1 ${r.progress.p1}% · 任务2 ${r.progress.p2}%<br>成果：${esc(r.progress.result)}${r.progress.delay?`<br>补救安排：${esc(r.progress.delay)}`:''}<div class="prog" style="margin-top:6px"><span>任务1</span><div class="track"><i style="width:${r.progress.p1}%"></i></div><span>${r.progress.p1}%</span></div><div class="prog"><span>任务2</span><div class="track"><i style="width:${r.progress.p2}%;background:var(--green)"></i></div><span>${r.progress.p2}%</span></div></p>`;
  else html+='<p style="font-size:13px;color:var(--red);margin-top:10px">📊 周四进度：未提交</p>';
  document.getElementById('modal-root').innerHTML=`<div class="mask" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()"><h3>${t} · ${WK.key}</h3>${html}<div style="text-align:right;margin-top:14px"><button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-root').innerHTML=''">关闭</button></div></div></div>`;
}
function closeModal(e){if(e.target.classList.contains('mask'))document.getElementById('modal-root').innerHTML='';}

function remindLate(){
  const data=store.get(), w=data[WK.key]||{};
  const late=TEAMS.filter(t=>{const r=w[t]||{};return !r.plan||!r.progress;});
  if(!late.length){toast('本周全部团队均按时提交，无需催办');return;}
  toast(`已向 ${late.length} 家团队推送催办提醒（正式版走小程序订阅消息）`);
}
function simulateWeek(){
  seedDemo(); renderAdmin(); toast('已载入模拟数据：约 1/4 团队未提交');
}
function exportCSV(){
  const data=store.get(), w=data[WK.key]||{};
  let csv='\uFEFF团队,周一计划,计划提交时间,周四进度,进度提交时间,任务1完成度,任务2完成度,平均完成度\n';
  TEAMS.forEach(t=>{
    const r=w[t]||{};
    csv+=`${t},${r.plan?'已交':'未交'},${r.plan?r.plan.at:''},${r.progress?'已交':'未交'},${r.progress?r.progress.at:''},${r.progress?r.progress.p1:''},${r.progress?r.progress.p2:''},${r.progress?Math.round((r.progress.p1+r.progress.p2)/2)+'%':''}\n`;
  });
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`OPC周报_${WK.key}.csv`; a.click();
  toast('CSV 已导出到下载目录');
}

function renderAll(){renderWeekBanner();if(role==='admin')renderAdmin();}
function switchRole(r){
  role=r;
  document.getElementById('tab-team').classList.toggle('active',r==='team');
  document.getElementById('tab-exit').classList.toggle('hidden',r!=='admin');
  document.getElementById('view-team').classList.toggle('hidden',r!=='team');
  document.getElementById('view-admin').classList.toggle('hidden',r!=='admin');
  if(r==='admin')renderAdmin();
}

let tapCount=0, tapTimer=null;
function titleTap(){
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer=setTimeout(()=>tapCount=0,1500);
  if(tapCount>=3){tapCount=0;askAdminPass();}
}
function askAdminPass(){
  document.getElementById('modal-root').innerHTML=`<div class="mask" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()"><h3>管理员登录</h3>
  <label>请输入管理密码</label><input type="password" id="admin-pass" onkeydown="if(event.key==='Enter')checkPass()" placeholder="管理密码">
  <div class="hint">密码错误将无法进入管理端</div>
  <div style="text-align:right;margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn btn-outline btn-sm" onclick="document.getElementById('modal-root').innerHTML=''">取消</button>
  <button class="btn btn-primary btn-sm" onclick="checkPass()">进入管理端</button></div></div></div>`;
  document.getElementById('admin-pass').focus();
}
function checkPass(){
  const v=document.getElementById('admin-pass').value;
  if(v===ADMIN_PASS){
    document.getElementById('modal-root').innerHTML='';
    switchRole('admin');
    toast('已进入管理端 ✔');
  }else{
    toast('密码错误');
    const el=document.getElementById('admin-pass'); if(el){el.value='';el.focus();}
  }
}

document.getElementById('stat-1-k').textContent='本周计划已交';
document.getElementById('stat-2-k').textContent='本周进度已交';
renderChips(); currentTeam=TEAMS[0]; renderAll();
