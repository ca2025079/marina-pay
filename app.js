(function () {
"use strict";

/* =========================================================
   1. 기본 설정과 급여 체계표
   ========================================================= */
const SLOTS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // 선택 가능한 예식 시간
const PM_START = 17;                                        // 17시부터 오후 예식(다시 1건)
const ALBA = [0, 30000, 42000, 55000, 65000, 75000, 85000]; // 알바 1~6건
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function albaPay(n) { if (n <= 0) return 0; if (n <= 6) return ALBA[n]; return 85000 + (n - 6) * 10000; }
function leaderPay(n) { return n <= 0 ? 0 : 40000 + 10000 * n; }          // 팀장: 40,000 + 10,000 × 건수

const won = n => Number(n || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return { y, m, d, dow: new Date(y, m - 1, d).getDay() }; }

const now = new Date();
const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const S = {
  roster: [], days: {}, tab: 'cal', y: now.getFullYear(), m: now.getMonth() + 1,
  open: null, draft: null, editable: false, loggedIn: false, view: 'main',
  loading: true, toast: '', confirm: null, loginErr: ''
};

/* =========================================================
   2. 계산
   ========================================================= */
function segs(day) {
  const w = [...(day.weddings || [])].sort((a, b) => a - b);
  return { am: w.filter(t => t < PM_START), pm: w.filter(t => t >= PM_START) };
}
// 첫 예식~마지막 예식 사이를 빈 시간까지 포함해서 셈 (근무자의 시작~끝 시간 안에서)
function countIn(seg, s, e) {
  if (!seg.length) return 0;
  const lo = Math.max(s, seg[0]), hi = Math.min(e, seg[seg.length - 1]);
  return hi >= lo ? hi - lo + 1 : 0;
}
function nameOf(sid) { const p = S.roster.find(r => r.id === sid); return p ? p.name : '(삭제된 인원)'; }
// 팀장을 맨 앞으로 정렬한 근무자 이름 목록
function staffNames(day){ return [...(day.staff||[])].sort((a,b)=>(a.role==='leader'?0:1)-(b.role==='leader'?0:1)).map(s=>({name:nameOf(s.sid),lead:s.role==='leader'})); }
function calcDay(day) {
  const { am, pm } = segs(day);
  const fee = Number(day.fee) || 0;
  const income = fee * (day.weddings || []).length;
  const people = (day.staff || []).map(a => {
    const nA = countIn(am, a.start, a.end), nP = countIn(pm, a.start, a.end);
    const f = a.role === 'leader' ? leaderPay : albaPay;
    return Object.assign({}, a, { name: nameOf(a.sid), nA, nP, pay: f(nA) + f(nP) });
  });
  const cost = people.reduce((s, p) => s + p.pay, 0);
  return { am, pm, fee, income, people, cost, total: income - cost };
}
function need(n) { return n <= 0 ? 0 : (n <= 2 ? 2 : 4); }
function checks(c) {
  const out = [];
  [['오전', c.am, 'nA'], ['오후', c.pm, 'nP']].forEach(([label, seg, key]) => {
    if (!seg.length) return;
    const cover = c.people.filter(p => p[key] > 0);
    const nd = need(seg.length);
    const leaders = cover.filter(p => p.role === 'leader').length;
    out.push({ bad: cover.length < nd, t: `${label} 예식 ${seg.length}개: ${nd}명 필요, ${cover.length}명 배정${cover.length >= nd ? ' 완료' : ''}` });
    if (leaders === 0) out.push({ bad: true, t: `${label}에 팀장이 없어요` });
    if (leaders > 1) out.push({ bad: true, t: `${label}에 팀장이 ${leaders}명이에요` });
  });
  return out;
}
function dateLabel(k) { const p = parseKey(k); return `${p.y}.${pad(p.m)}.${pad(p.d)}`; }

/* =========================================================
   3. 영수증
   ========================================================= */
function receiptLines(day, c) {
  const L = [], ind = '       ';
  L.push({ t: `${day.venue || '순천 마리나'} (${dateLabel(day.id)})` }, { t: '' });
  L.push({ t: `행사 : ${won(c.fee)}×${(day.weddings || []).length} = `, g: won(c.income) });
  const albas = c.people.filter(p => p.role !== 'leader' && p.pay > 0);
  if (albas.length) {
    const groups = {};
    albas.forEach(p => { groups[p.pay] = (groups[p.pay] || 0) + 1; });
    L.push({ t: '' });
    Object.keys(groups).map(Number).sort((a, b) => b - a)
      .forEach((k, i) => L.push({ t: `${i ? ind : '알바 : '}${won(k)}×${groups[k]} = `, g: won(k * groups[k]) }));
  }
  const leads = c.people.filter(p => p.role === 'leader' && p.pay > 0);
  if (leads.length) {
    L.push({ t: '' });
    let first = true;
    leads.forEach(p => [p.nA, p.nP].forEach(n => {
      if (n <= 0) return;
      L.push({ t: `${first ? '팀장 : ' : ind}40,000×1 = `, g: '40,000' }); first = false;
      L.push({ t: `${ind}10,000×${n} = `, g: won(10000 * n) });
    }));
  }
  L.push({ t: '' }, { t: `계 : ${won(c.total)}`, strong: true });
  const ordered = [...leads, ...albas];
  if (ordered.length) { L.push({ t: '' }); ordered.forEach(p => L.push({ t: `${p.name} ${won(p.pay)}` })); }
  return L;
}
const receiptText = (day, c) => receiptLines(day, c).map(l => l.t + (l.g || '')).join('\n');

/* =========================================================
   4. Supabase 연결
   ========================================================= */
const cfg = window.APP_CONFIG || {};
const configured = cfg.SUPABASE_URL && cfg.SUPABASE_KEY && !/여기에/.test(cfg.SUPABASE_URL + cfg.SUPABASE_KEY);
const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;
const pending = {}; // 아직 저장 중인 날짜

function fail(msg, err) { console.error(err); S.toast = msg; render(); }

async function loadAll() {
  const [st, dy] = await Promise.all([
    sb.from('marina_staff').select('id,name,created_at').order('created_at'),
    sb.from('marina_work_days').select('*')
  ]);
  if (st.error || dy.error) return fail('데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요', st.error || dy.error);
  S.roster = st.data || [];
  const m = {};
  (dy.data || []).forEach(d => { m[d.id] = { id: d.id, venue: d.venue, fee: d.fee, weddings: d.weddings || [], staff: d.staff || [] }; });
  Object.keys(pending).forEach(id => { const p = pending[id].data; if (p.__deleted) delete m[id]; else m[id] = clone(p); });
  S.days = m; S.loading = false; render();
}
async function checkAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  S.loggedIn = !!session;
  S.editable = false;
  if (session) {
    const { data, error } = await sb.from('marina_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
    S.editable = !error && !!data;
  }
}
function saveDay(day) {
  const id = day.id;
  if (pending[id] && pending[id].timer) clearTimeout(pending[id].timer);
  pending[id] = { data: clone(day), timer: setTimeout(() => flushDay(id), 500) };
}
async function flushDay(id) {
  const p = pending[id]; if (!p) return;
  p.timer = null; const data = p.data;
  const res = data.__deleted
    ? await sb.from('marina_work_days').delete().eq('id', id)
    : await sb.from('marina_work_days').upsert({ id, venue: data.venue, fee: data.fee, weddings: data.weddings, staff: data.staff, updated_at: new Date().toISOString() });
  if (res.error) fail('저장에 실패했어요. 다시 시도해 주세요', res.error);
  if (pending[id] && pending[id].data === data && !pending[id].timer) delete pending[id];
}

/* =========================================================
   5. 수정 동작
   ========================================================= */
function curDay() { return S.open ? (S.days[S.open] || S.draft) : null; }
function newDay(id) { return { id, venue: '순천 마리나', fee: 300000, weddings: [], staff: [] }; }
function mutateDay(fn) {
  if (!S.editable) return;
  const d = clone(curDay()); fn(d);
  S.days[d.id] = d; S.draft = null; saveDay(d); render();
}

/* =========================================================
   6. 화면 그리기
   ========================================================= */
function render() {
  const app = document.getElementById('app');
  const ae = document.activeElement;
  const fid = ae && ae.id, sel = ae && ('selectionStart' in ae) ? [ae.selectionStart, ae.selectionEnd] : null;

  let h = `<header class="top"><div><h1>마리나 예도</h1><small>스케줄과 일비 정산</small></div><div class="topbtns">`;
  if (sb) h += S.loggedIn ? `<button class="btn ghost small" data-act="logout">로그아웃</button>` : `<button class="btn ghost small" data-act="gologin">관리자 로그인</button>`;
  h += `</div></header>`;

  if (!configured) { app.innerHTML = h + `<p class="note">config.js 에 Supabase 주소와 키를 넣어 주세요.</p>`; return; }
  if (!sb) { app.innerHTML = h + `<p class="note">Supabase 프로그램을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>`; return; }
  if (S.view === 'login') { app.innerHTML = h + renderLogin(); return; }
  if (S.loading) { app.innerHTML = h + '<p class="note">불러오는 중…</p>'; return; }

  if (!S.editable) h += `<p class="note">${S.loggedIn ? '관리자로 등록되지 않은 계정이에요. 보기만 할 수 있어요.' : '보기 전용이에요. 수정하려면 관리자 로그인을 해 주세요.'}</p>`;
  if (S.toast) h += `<p class="note" role="status">${esc(S.toast)}</p>`;
  if (S.open) h += renderEditor();
  else {
    h += `<nav class="tabs"><button data-act="tab" data-v="cal" aria-pressed="${S.tab === 'cal'}">스케줄</button><button data-act="tab" data-v="people" aria-pressed="${S.tab === 'people'}">인원·정산</button></nav>`;
    h += S.tab === 'cal' ? renderCal() : renderPeople();
  }
  app.innerHTML = h;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { } } } }
}
function renderLogin() {
  return `<div class="login"><h2>관리자 로그인</h2>
    <input type="email" id="l-email" placeholder="이메일" autocomplete="username">
    <input type="password" id="l-pw" placeholder="비밀번호" autocomplete="current-password">
    ${S.loginErr ? `<p class="err">${esc(S.loginErr)}</p>` : ''}
    <button class="btn" data-act="login">로그인</button>
    <button class="btn ghost" data-act="cancellogin">돌아가기</button></div>`;
}
function monthDays() {
  const pre = `${S.y}-${pad(S.m)}-`;
  return Object.keys(S.days).filter(k => k.startsWith(pre)).sort().map(k => S.days[k]);
}
function monthBar() {
  return `<div class="monthbar"><button class="iconbtn" data-act="mon" data-v="-1" aria-label="이전 달">‹</button><h2>${S.y}년 ${S.m}월</h2><button class="iconbtn" data-act="mon" data-v="1" aria-label="다음 달">›</button></div>`;
}
function renderCal() {
  let h = monthBar();
  h += `<div class="cal">` + DOW.map((d, i) => `<div class="dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</div>`).join('');
  const first = new Date(S.y, S.m - 1, 1).getDay(), dim = new Date(S.y, S.m, 0).getDate();
  for (let i = 0; i < first; i++) h += `<div class="cell empty"></div>`;
  for (let d = 1; d <= dim; d++) {
    const k = `${S.y}-${pad(S.m)}-${pad(d)}`, dow = (first + d - 1) % 7, day = S.days[k];
    const cls = ['cell', dow === 0 ? 'sun' : dow === 6 ? 'sat' : '', (dow === 0 || dow >= 5) ? 'wk' : '', day ? 'has' : '', k === todayKey ? 'today' : ''].join(' ');
    const meta = day ? `<span class="meta">예식 ${day.weddings.length}</span>` + staffNames(day).map(x => `<span class="nm${x.lead ? ' lead' : ''}">${esc(x.name)}</span>`).join('') : '';
    h += `<button class="${cls}" data-act="open" data-v="${k}" aria-label="${S.m}월 ${d}일 ${DOW[dow]}요일${day ? ' 근무 있음' : ''}"><span class="d">${d}</span>${meta}</button>`;
  }
  h += `</div>`;
  const md = monthDays();
  let inc = 0, cost = 0;
  md.forEach(d => { const c = calcDay(d); inc += c.income; cost += c.cost; });
  h += `<div class="sum"><div><span>근무일</span><b>${md.length}일</b></div><div><span>행사비</span><b>${won(inc)}</b></div><div><span>인건비</span><b>${won(cost)}</b></div><div><span>예식 수</span><b>${md.reduce((s, d) => s + d.weddings.length, 0)}개</b></div><div class="total"><span>계</span><b>${won(inc - cost)}</b></div></div>`;
  h += `<h3>${S.m}월 근무일</h3>`;
  if (!md.length) h += `<div class="empty-msg">${S.editable ? '달력에서 날짜를 눌러 근무를 추가하세요.' : '이번 달 등록된 근무가 없어요.'}</div>`;
  else {
    h += `<div class="list">` + md.map(d => {
      const p = parseKey(d.id), c = calcDay(d);
      const times = d.weddings.length ? [...d.weddings].sort((a, b) => a - b).join(', ') + '시' : '예식 미입력';
      return `<button class="row" data-act="open" data-v="${d.id}"><span><b>${p.d}일 (${DOW[p.dow]})</b><span class="sub" style="display:block">${esc(times)}</span><span class="names">${staffNames(d).map(x=>esc(x.name)+(x.lead?'(팀장)':'')).join(', ')||'근무자 미배정'}</span></span><span class="amt">${won(c.total)}</span></button>`;
    }).join('') + `</div>`;
    h += `<div class="copybar" style="margin-top:12px"><button class="btn ghost" data-act="copymonth">${S.m}월 스케줄 복사</button></div>`;
  }
  return h;
}
function timeOpts(v) { return SLOTS.map(t => `<option value="${t}" ${t === v ? 'selected' : ''}>${t}시</option>`).join(''); }
function renderEditor() {
  const day = curDay(), c = calcDay(day), p = parseKey(day.id), dis = S.editable ? '' : 'disabled';
  let h = `<div class="edhead"><button class="iconbtn" data-act="close" aria-label="달력으로">‹</button><h2>${p.m}월 ${p.d}일 (${DOW[p.dow]})</h2></div>`;
  h += `<div class="two"><div class="field"><label for="f-venue">장소</label><input type="text" id="f-venue" data-act="venue" value="${esc(day.venue)}" ${dis}></div>`;
  h += `<div class="field"><label for="f-fee">예도비 (1개 예식)</label><input type="text" inputmode="numeric" id="f-fee" data-act="fee" value="${won(day.fee)}" ${dis}></div></div>`;
  h += `<div class="field"><label>예식 시간</label><div class="slots">` + SLOTS.map(t => `<button class="slot ${t >= PM_START ? 'pm' : ''}" data-act="slot" data-v="${t}" aria-pressed="${day.weddings.includes(t)}" ${dis}>${t}시</button>`).join('') + `</div><div class="hint">점선은 오후 예식(17시부터 다시 1건)이에요.</div></div>`;
  const ck = checks(c);
  if (ck.length) h += `<div class="status">` + ck.map(x => `<div class="${x.bad ? 'bad' : 'good'}">${esc(x.t)}</div>`).join('') + `</div>`;
  h += `<h3>근무자</h3>`;
  if (!day.staff.length) h += `<div class="empty-msg" style="margin-bottom:10px">${S.editable ? '아래에서 근무자를 추가하세요.' : '배정된 근무자가 없어요.'}</div>`;
  c.people.forEach((w, i) => {
    const parts = []; if (w.nA) parts.push(`오전 ${w.nA}건`); if (w.nP) parts.push(`오후 ${w.nP}건`);
    h += `<div class="worker ${w.role === 'leader' ? 'lead' : ''}"><div class="wtop"><b>${esc(w.name)}</b><span class="seg"><button data-act="role" data-i="${i}" data-v="leader" aria-pressed="${w.role === 'leader'}" ${dis}>팀장</button><button data-act="role" data-i="${i}" data-v="alba" aria-pressed="${w.role !== 'leader'}" ${dis}>알바</button></span></div>`;
    h += `<div class="two"><div class="field" style="margin:0"><label for="s-${i}">시작</label><select id="s-${i}" data-act="start" data-i="${i}" ${dis}>${timeOpts(w.start)}</select></div><div class="field" style="margin:0"><label for="e-${i}">몇 시까지</label><select id="e-${i}" data-act="end" data-i="${i}" ${dis}>${timeOpts(w.end)}</select></div></div>`;
    h += `<div class="wcalc"><span>${parts.join(' + ') || '해당 예식 없음'}</span><b>${won(w.pay)}</b></div>`;
    if (S.editable) h += `<div style="text-align:right;margin-top:8px"><button class="btn danger small" data-act="unassign" data-i="${i}">빼기</button></div>`;
    h += `</div>`;
  });
  if (S.editable) {
    const avail = S.roster.filter(r => !day.staff.some(s => s.sid === r.id));
    if (!S.roster.length) h += `<div class="empty-msg">먼저 인원·정산 탭에서 이름을 추가하세요. <button class="btn small" data-act="gopeople" style="margin-left:6px">이름 추가하러 가기</button></div>`;
    else if (avail.length) h += `<div class="addrow"><select id="f-add" aria-label="추가할 근무자">${avail.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><button class="btn" data-act="assign">추가</button></div>`;
  }
  h += `<h3>영수증</h3><div class="receipt"><pre>` + receiptLines(day, c).map(l => `${l.strong ? '<span class="t">' : ''}${esc(l.t)}${l.g ? `<span class="g">${esc(l.g)}</span>` : ''}${l.strong ? '</span>' : ''}`).join('\n') + `</pre></div>`;
  h += `<div class="copybar"><button class="btn" data-act="copy">영수증 복사</button></div>`;
  if (S.editable && S.days[day.id]) {
    h += `<div style="margin-top:32px">` + (S.confirm === day.id
      ? `<button class="btn danger" data-act="delday">정말 이 날을 삭제할까요? 누르면 삭제</button> <button class="btn ghost" data-act="cancel">취소</button>`
      : `<button class="btn danger" data-act="askdel">이 날 삭제</button>`) + `</div>`;
  }
  return h;
}
function renderPeople() {
  let h = '';
  if (S.editable) h += `<div class="addrow" style="margin-bottom:16px"><input type="text" id="f-newname" placeholder="이름 입력" aria-label="새 이름"><button class="btn" data-act="addname">이름 추가</button></div>`;
  h += monthBar();
  if (!S.roster.length) return h + `<div class="empty-msg">아직 등록된 인원이 없어요.</div>`;
  const md = monthDays();
  S.roster.forEach(r => {
    const rows = []; let total = 0;
    md.forEach(d => {
      const w = calcDay(d).people.find(x => x.sid === r.id);
      if (w) { total += w.pay; const p = parseKey(d.id); rows.push(`<li><span>${p.d}일 (${DOW[p.dow]}) ${w.start}~${w.end}시${w.role === 'leader' ? ' 팀장' : ''}</span><span>${won(w.pay)}</span></li>`); }
    });
    h += `<div class="person"><div class="ptop">` + (S.editable
      ? `<input type="text" id="n-${r.id}" data-act="rename" data-v="${r.id}" value="${esc(r.name)}" aria-label="이름 수정">` + (S.confirm === r.id ? `<button class="btn danger small" data-act="delname" data-v="${r.id}">삭제 확인</button><button class="btn ghost small" data-act="cancel">취소</button>` : `<button class="btn ghost small" data-act="askdelname" data-v="${r.id}">삭제</button>`)
      : `<b style="font-size:20px">${esc(r.name)}</b>`) + `</div>`;
    h += `<div class="pstats"><span>${S.m}월 ${rows.length}일 근무</span><span class="amt">${won(total)}</span></div>`;
    if (rows.length) h += `<ul class="pdays">${rows.join('')}</ul>`;
    h += `</div>`;
  });
  return h;
}

/* =========================================================
   7. 복사
   ========================================================= */
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { }
  try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function monthText() {
  const out = [`${S.m}월 스케줄`];
  monthDays().forEach(d => {
    const p = parseKey(d.id), c = calcDay(d);
    out.push('', `[${p.m}월 ${p.d}일 ${DOW[p.dow]}] ${d.venue || ''}`.trim());
    out.push(`예식: ${d.weddings.length ? [...d.weddings].sort((a, b) => a - b).join(', ') + '시' : '미정'}`);
    [...c.people].sort((a, b) => (a.role === 'leader' ? 0 : 1) - (b.role === 'leader' ? 0 : 1))
      .forEach(w => out.push(`${w.name}${w.role === 'leader' ? '(팀장)' : ''} ${w.start}~${w.end}시`));
  });
  return out.join('\n');
}
function flash(msg) { S.toast = msg; render(); setTimeout(() => { if (S.toast === msg) { S.toast = ''; render(); } }, 2200); }

/* =========================================================
   8. 버튼·입력 처리
   ========================================================= */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, v = b.dataset.v, i = Number(b.dataset.i);
  if (['venue', 'fee', 'rename', 'start', 'end'].includes(a)) return;

  if (a === 'tab') { S.tab = v; S.confirm = null; render(); }
  else if (a === 'gologin') { S.view = 'login'; S.loginErr = ''; render(); }
  else if (a === 'cancellogin') { S.view = 'main'; render(); }
  else if (a === 'login') {
    const email = document.getElementById('l-email').value.trim(), password = document.getElementById('l-pw').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { S.loginErr = '이메일 또는 비밀번호를 확인해 주세요'; render(); return; }
    await checkAdmin(); S.view = 'main'; render();
  }
  else if (a === 'logout') { await sb.auth.signOut(); await checkAdmin(); S.open = null; render(); }
  else if (a === 'gopeople') { S.open = null; S.draft = null; S.tab = 'people'; render(); }
  else if (a === 'mon') { S.m += Number(v); if (S.m < 1) { S.m = 12; S.y--; } if (S.m > 12) { S.m = 1; S.y++; } render(); }
  else if (a === 'open') {
    if (!S.days[v] && !S.editable) return; // 보기 전용일 때 빈 날짜는 열지 않음
    S.open = v; S.confirm = null; S.draft = S.days[v] ? null : newDay(v); render(); window.scrollTo(0, 0);
  }
  else if (a === 'close') { S.open = null; S.draft = null; S.confirm = null; render(); }
  else if (a === 'slot') { const t = Number(v); mutateDay(d => { d.weddings = d.weddings.includes(t) ? d.weddings.filter(x => x !== t) : [...d.weddings, t].sort((x, y) => x - y); }); }
  else if (a === 'role') { mutateDay(d => { d.staff[i].role = v; }); }
  else if (a === 'unassign') { mutateDay(d => { d.staff.splice(i, 1); }); }
  else if (a === 'assign') {
    const sel = document.getElementById('f-add'); if (!sel || !sel.value) return;
    mutateDay(d => {
      const w = [...d.weddings].sort((x, y) => x - y);
      d.staff.push({ sid: sel.value, role: d.staff.some(s => s.role === 'leader') ? 'alba' : 'leader', start: w.length ? w[0] : 11, end: w.length ? w[w.length - 1] : 16 });
    });
  }
  else if (a === 'copy') { const d = curDay(); const ok = await copyText(receiptText(d, calcDay(d))); flash(ok ? '영수증을 복사했어요' : '복사가 안 되면 영수증 글자를 길게 눌러 복사하세요'); }
  else if (a === 'copymonth') { const ok = await copyText(monthText()); flash(ok ? `${S.m}월 스케줄을 복사했어요` : '복사에 실패했어요'); }
  else if (a === 'askdel' || a === 'askdelname') { S.confirm = v || S.open; render(); }
  else if (a === 'cancel') { S.confirm = null; render(); }
  else if (a === 'delday') {
    const id = S.open; delete S.days[id];
    if (pending[id] && pending[id].timer) clearTimeout(pending[id].timer);
    pending[id] = { data: { id, __deleted: true }, timer: null }; flushDay(id);
    S.open = null; S.draft = null; S.confirm = null; render();
  }
  else if (a === 'addname') {
    const inp = document.getElementById('f-newname'); const name = (inp && inp.value || '').trim(); if (!name) return;
    const { data, error } = await sb.from('marina_staff').insert({ name }).select().single();
    if (error) return fail('이름을 추가하지 못했어요', error);
    S.roster.push(data); render();
    const n = document.getElementById('f-newname'); if (n) { n.value = ''; n.focus(); }
  }
  else if (a === 'delname') {
    const { error } = await sb.from('marina_staff').delete().eq('id', v);
    if (error) return fail('삭제하지 못했어요', error);
    S.roster = S.roster.filter(r => r.id !== v); S.confirm = null; render();
  }
});
document.addEventListener('change', async e => {
  const el = e.target, a = el.dataset && el.dataset.act, i = Number(el.dataset.i);
  if (a === 'start' || a === 'end') {
    const val = Number(el.value);
    mutateDay(d => { const w = d.staff[i]; w[a] = val; if (w.start > w.end) { if (a === 'start') w.end = val; else w.start = val; } });
  }
  else if (a === 'venue') { const val = el.value.trim() || '순천 마리나'; mutateDay(d => { d.venue = val; }); }
  else if (a === 'fee') { const val = Number(String(el.value).replace(/[^0-9]/g, '')) || 0; mutateDay(d => { d.fee = val; }); }
  else if (a === 'rename') {
    const val = el.value.trim(); const r = S.roster.find(x => x.id === el.dataset.v);
    if (r && val && val !== r.name) {
      const { error } = await sb.from('marina_staff').update({ name: val }).eq('id', r.id);
      if (error) return fail('이름을 바꾸지 못했어요', error);
      r.name = val; render();
    }
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'f-newname') { e.preventDefault(); const b = document.querySelector('[data-act="addname"]'); if (b) b.click(); }
  else if (e.target.id === 'l-pw' || e.target.id === 'l-email') { e.preventDefault(); const b = document.querySelector('[data-act="login"]'); if (b) b.click(); }
  else if (e.target.dataset && ['venue', 'fee', 'rename'].includes(e.target.dataset.act)) e.target.blur();
});
// 앱으로 다시 돌아오면 최신 내용으로 새로고침
document.addEventListener('visibilitychange', () => { if (sb && document.visibilityState === 'visible' && !Object.keys(pending).length) loadAll(); });

/* =========================================================
   9. 시작
   ========================================================= */
(async function start() {
  render();
  if (!sb) return;
  await checkAdmin();
  await loadAll();
})();
})();
