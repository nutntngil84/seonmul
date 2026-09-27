import './styles.css';
import './human-first.css';
import { CATS, CAREERS, GREETINGS, MENTOR_GREETINGS, esc, icon, fmt, plain, brand, plantMark } from './design.js';
import * as api from './backend.js';
import { enablePush, disablePush, nativeAvailable,initializePush,resumePush } from './push.js';

const $=s=>document.querySelector(s);
let data=null, view='home', active=null, category='practice', lastGreeting=-1, greeting=0;
let search='', favoritesOnly=false, statusFilter='all', authMode='login', busy=false;
let draft='', feedbackDraft='', pending=null, dialogOpener=null, errorText='', toastTimer, refreshTimer, pendingDeepLink=null;
const questionRequests=new Map();
const screenDrafts=new Map();
const preview=()=>api.isPreview();
const staff=()=>['mentor','admin'].includes(data?.profile?.role);
const mine=c=>c.user_id===data?.user.id;
const current=()=>data?.consultations.find(c=>c.id===active);
const messages=cid=>data.consultation_messages.filter(m=>m.consultation_id===cid).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
const favorite=cid=>data.favorites.some(f=>f.consultation_id===cid);
const nickname=()=>data?.profile?.nickname||'후배';
const status=c=>c.status==='answered'?(staff()&&!mine(c)?'답변 완료':'답변 도착'):c.status==='closed'?'상담 종료':'답변 대기';
function chooseGreeting(){const choices=staff()?MENTOR_GREETINGS:GREETINGS;greeting=Math.floor(Math.random()*choices.length);if(greeting===lastGreeting)greeting=(greeting+1)%choices.length;lastGreeting=greeting;}
function toast(t){clearTimeout(toastTimer);$('#toast-root').innerHTML=`<div class="toast" role="status">${esc(t)}</div>`;toastTimer=setTimeout(()=>$('#toast-root').innerHTML='',6000);}
function capture(){if($('#question-body'))draft=$('#question-body').value;if($('#feedback-body'))feedbackDraft=$('#feedback-body').value;}
function navigate(next,id){capture();screenDrafts.set(view==='chat'?active:'home',{draft,feedbackDraft});closeDialog();if(next==='home'&&view!=='home')chooseGreeting();if(id)active=id;view=next;const saved=screenDrafts.get(view==='chat'?active:'home');draft=saved?.draft||'';feedbackDraft=saved?.feedbackDraft||'';errorText='';render();window.scrollTo(0,0);$('#main')?.focus({preventScroll:true});}
function heading(title,desc){return `<div class="page-heading"><h1>${title}</h1><p>${desc}</p></div>`;}
function empty(title,desc){return `<div class="empty"><div class="empty-icon">${icon('chat')}</div><h3>${title}</h3><p>${desc}</p><button class="btn secondary" data-view="home">홈으로</button></div>`;}
function profileCard(){const bio=data.profile.bio?.trim()||'';return `<button class="nickname-card" data-action="profile" aria-label="프로필과 소개글 수정"><div class="profile-plant">${plantMark(data.profile.career)}</div><div class="nickname-copy"><strong>${esc(nickname())}</strong><span>${esc(data.profile.career)}</span><span class="profile-bio ${bio?'':'empty-bio'}">${bio?esc(bio):'간단한 소개를 남겨봐'}</span></div>${icon('edit')}</button>`;}
function shell(body){
  const routes=staff()
    ? [['home','home','홈'],['consultations','people','받은 질문'],['notifications','bell','알림'],['knowledge','book','상담 노하우']]
    : [['home','home','홈'],['history','chat','내 대화'],['consultations','people','선배 상담'],['growth','book','성장기록']];
  const unread=data.notifications.filter(n=>!n.read_at).length;
  const nav=mobile=>routes.map(([v,i,t])=>`<button class="${mobile?'':'nav-item '}${view===v?'active':''}" data-view="${v}" ${view===v?'aria-current="page"':''}>${icon(i)}<span>${t}</span></button>`).join('');
  return `<aside class="sidebar">${brand()}<nav class="nav" aria-label="주요 메뉴">${nav(false)}</nav><div class="sidebar-footer"><button class="btn ghost" data-view="settings">${icon('settings')}설정</button><p>처음엔 물어보는 후배로,<br>언젠가는 답해주는 선배로.<br><br>후배가 선배가 되는 날까지.</p></div></aside>
  <div class="app-main"><header class="topbar">${brand()}<div class="topbar-left">${staff()?'후배의 질문에 선배의 경험으로 답해줘.':'사수에게 묻기 어려운 것도, 여기서는 편하게.'}</div><div class="topbar-right"><span class="demo-pill">${preview()?'둘러보기 · 외부 전송 없음':'실제 선배 상담'}</span><button class="icon-btn" data-view="notifications" aria-label="알림 ${unread}개">${icon('bell')}${unread?`<span class="count">${unread}</span>`:''}</button><button class="icon-btn" data-view="settings" aria-label="설정">${icon('settings')}</button></div></header>
  <main id="main" tabindex="-1" class="content ${view==='chat'?'consult-chat':''}">${preview()?'<div class="notice warm preview-banner">이 기기에서 상담 흐름을 둘러보는 중이야. 실제 접수·서버 저장·휴대폰 푸시는 연결되지 않았어.</div>':''}<div id="sync-note" aria-live="polite"></div>${errorText?`<div class="notice error" role="alert">${esc(errorText)} <button data-action="refresh" class="text-link">다시 불러오기</button></div>`:''}${body}</main></div><nav class="mobile-nav" aria-label="모바일 주요 메뉴">${nav(true)}</nav>`;
}
function authView(){
 return `<main id="main" class="welcome-wrap"><header class="welcome-head">${brand()}<span class="demo-pill">선배가 직접 답하는 선물</span></header><div class="welcome-grid"><section class="welcome-copy"><span class="label">후배가 선배가 되는 날까지.</span><h1>그 질문,<br>여기서는 편하게.</h1><p>실무가 막힐 때도, 회사생활이 버거울 때도.<br>선배에게 상황을 들려줘.<br>답변이 오면 알림함에서 이어서 볼 수 있어.</p><div class="quote">“저… 하나만 물어봐도 돼요?”<br>“그럼. 어떤 게 어려워?”<small>정답을 재촉하지 않고, 다음 한 걸음을 함께.</small></div></section><section class="welcome-card">
 ${api.configured?`<h2>선물에서 만나자</h2><p>처음 로그인하면 가입이 함께 진행돼. 같은 계정으로 PC와 앱에서 상담을 이어가.</p><button class="btn kakao full" type="button" data-action="kakao-login">카카오로 시작하기</button><p class="tiny muted auth-note">카카오 첫 로그인 시 계정이 자동으로 만들어져.</p><p class="form-error" id="auth-error" role="alert"></p><details class="email-auth"><summary>이메일로 로그인하거나 가입하기</summary><form id="auth-form"><label class="field-label" for="email">이메일</label><input id="email" class="field" type="email" autocomplete="email" required><label class="field-label" for="password">비밀번호</label><input id="password" class="field" type="password" minlength="8" autocomplete="${authMode==='signup'?'new-password':'current-password'}" required><button class="btn full" type="submit">${authMode==='signup'?'가입하기':'로그인'}</button><button class="btn ghost full" type="button" data-action="auth-mode">${authMode==='signup'?'이미 계정이 있어요':'처음이에요 · 가입하기'}</button></form></details>`:
 `<h2>선배 상담을<br>먼저 둘러볼까?</h2><p>기존 선물 화면에 실제 선배 상담 흐름을 반영했어.</p><div class="notice warm">현재는 서버 연결 전이야. 입력한 내용은 이 브라우저에만 저장되고 실제 선배에게 전송되지 않아.</div>${api.previewAllowed?`<button class="btn full" data-preview="junior">후배로 둘러보기 ${icon('arrow')}</button><button class="btn secondary full" data-preview="mentor">선배 답변 화면 둘러보기</button>`:'<p class="form-error">서비스 연결 준비 중입니다. 아직 회원가입과 상담 접수를 받지 않습니다.</p>'}`}
 </section></div><footer class="welcome-foot">실제 선배 상담 중심 · AI 자동 답변 없음 · 결제와 제공 횟수 제한 없음</footer></main>`;
}
function homeView(){
  if(staff())return mentorHomeView();
  const g=GREETINGS[greeting];const recent=[...data.consultations].filter(mine).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,3);
  return `<section>${profileCard()}<div class="greeting"><div class="eyebrow">후배 · 질문하기</div><h1>${esc(g.main(nickname()))}</h1><p>${esc(g.sub)}</p></div>
  <form id="home-form" class="home-composer"><label class="sr-only" for="question-body">선배에게 할 질문</label><textarea id="question-body" maxlength="5000" rows="2" placeholder="선배한테 편하게 얘기해봐">${esc(draft)}</textarea><button class="btn" type="submit">보낼 내용 확인 ${icon('arrow')}</button></form><p class="input-note">아직 전송되지 않아. 다음 화면에서 내용을 확인하고 공유에 동의하면 접수돼. 실명·거래처명·주민등록번호는 빼줘.</p>
  <div class="category-grid">${Object.entries(CATS).map(([k,c])=>`<button class="category-card ${category===k?'chosen':''}" data-category="${k}" aria-pressed="${category===k}"><div class="category-icon ${k}">${icon(c.icon)}</div><div><h3>${c.name}</h3><p>${c.desc}</p></div>${category===k?icon('check'):icon('arrow')}</button>`).join('')}</div>
  <div class="section-heading"><h2>이어서 나눌 이야기</h2><button class="text-link" data-view="history">내 대화 모두 보기</button></div>${recent.length?recent.map(card).join(''):'<p class="muted">첫 이야기를 나누면 여기에 이어서 볼 수 있어.</p>'}<div class="footer-line">선배가 확인한 뒤 직접 답해줘. 답변 시간은 보장하지 않으니 급한 업무는 사무실 담당자에게 먼저 확인해줘.</div></section>`;
}
function mentorHomeView(){
  const g=MENTOR_GREETINGS[greeting%MENTOR_GREETINGS.length];
  const recent=data.consultations.filter(c=>c.mentor_id===data.user.id).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,3);
  return `<section>${profileCard()}<div class="greeting"><div class="eyebrow">선배 · 답변하기</div><h1>${esc(g.main(nickname()))}</h1><p>${esc(g.sub)}</p></div><div class="consult-banner"><div><h3>후배가 남긴 질문을 확인해줘.</h3><p>나에게 배정된 질문을 열고 답변을 남길 수 있어.</p><button class="btn" data-view="consultations">받은 질문 보기 ${icon('arrow')}</button></div></div><div class="section-heading"><h2>최근 받은 이야기</h2><button class="text-link" data-view="consultations">받은 질문 모두 보기</button></div>${recent.length?recent.map(card).join(''):'<p class="muted">아직 배정된 질문이 없어. 질문이 도착하면 알림함에서도 확인할 수 있어.</p>'}<div class="footer-line">상황을 먼저 확인하고, 직접 해본 방법과 다음 행동을 짧게 알려줘. 후배가 다시 물어볼 수 있도록 격려도 함께 남겨줘.</div></section>`;
}
function card(c){const last=messages(c.id).at(-1);return `<article class="history-entry"><button class="history-card" data-consult="${c.id}"><div class="history-meta"><span class="badge ${c.status==='answered'?'green':'amber'}">${status(c)}</span><span>${esc(CATS[c.category]?.name||'상담')}</span><span class="spacer"></span><span>${fmt(c.updated_at)}</span></div><h3>${esc(c.title)}</h3><p>${last?esc(last.body):''}</p></button><button class="icon-btn favorite-toggle ${favorite(c.id)?'active':''}" data-favorite="${c.id}" aria-pressed="${favorite(c.id)}" aria-label="${esc(c.title)} 즐겨찾기 ${favorite(c.id)?'해제':'추가'}">${icon('star')}</button></article>`;}
function listView(){
 const received=staff()&&view==='consultations';
 const rows=data.consultations.filter(c=>(received?c.mentor_id===data.user.id:mine(c))&&(!favoritesOnly||favorite(c.id))&&(statusFilter==='all'||c.status===statusFilter)&&(!search||[c.title,...messages(c.id).map(m=>m.body)].some(s=>s.includes(search)))).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 return `${heading(received?'받은 질문':view==='history'?'내 대화':'선배 상담',received?'나에게 배정된 질문을 열고 답변을 남겨줘.':'같은 질문이어도 괜찮아. 필요할 때 다시 꺼내보자.')}<div class="searchbar">${icon('search')}<label class="sr-only" for="history-search">대화 검색</label><input id="history-search" placeholder="질문이나 답변에서 찾아보기" value="${esc(search)}"></div><div class="row wrap"><button class="btn secondary small" data-action="favorites-only" aria-pressed="${favoritesOnly}">${icon('star')}즐겨찾기 ${favoritesOnly?'켜짐':'모아보기'}</button><button class="btn secondary small" data-action="refresh">${icon('clock')}새로 불러오기</button></div><div class="tabs">${[['all','전체'],['waiting','답변 대기'],['answered',received?'답변 완료':'답변 도착']].map(([v,t])=>`<button class="tab ${v===statusFilter?'active':''}" data-filter="${v}">${t}</button>`).join('')}</div><div id="history-results">${rows.length?rows.map(card).join(''):empty(received?'아직 해당하는 질문이 없어.':'아직 해당하는 대화가 없어.',received?'나에게 배정된 질문이 여기에 모여. 검색이나 답변 상태 조건도 확인해줘.':'새 질문을 남기거나 검색 조건을 바꿔봐.')}</div>`;
}
function chatView(){
 const c=current();if(!c)return empty('이 상담을 열 수 없어.','접근 권한이 없거나 삭제된 상담이야.');const owner=mine(c);const ms=messages(c.id);const name=data.mentors.find(m=>m.user_id===c.mentor_id)?.display_name||'담당 선배';
 return `<div class="chat-header"><button class="icon-btn" data-view="consultations" aria-label="상담 목록으로">${icon('left')}</button><div class="mentor-avatar">선</div><div class="chat-title"><h2>${owner?esc(name):esc(c.nickname)+'의 이야기'}</h2><p>${esc(CATS[c.category]?.name)} · ${status(c)}</p></div><span class="spacer"></span><button class="icon-btn favorite-toggle ${favorite(c.id)?'active':''}" data-favorite="${c.id}" aria-label="즐겨찾기 ${favorite(c.id)?'해제':'추가'}" aria-pressed="${favorite(c.id)}">${icon('star')}</button></div>
 <div class="chat-scroller" id="chat-scroll" role="log" aria-label="상담 대화"><div class="chat-datestamp">${fmt(c.created_at)} · ${preview()?'둘러보기 기록':'공유에 동의한 대화'}</div>${ms.map(m=>`<article class="message ${m.author_id===data.user.id?'user':'assistant'}"><div class="message-main"><div class="message-name"><strong>${esc(m.author_name)}</strong>${m.author_kind==='mentor'?(preview()?'선배 입력 · 체험':'선배 직접 답변'):'후배'} · ${fmt(m.created_at,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div><div class="bubble">${plain(m.body)}</div>${m.feedback?`<div class="quote-note"><strong>선배가 짚어준 점</strong><p>${esc(m.feedback)}</p></div>`:''}${owner&&m.author_kind==='mentor'?`<button class="text-link" data-reflection="${c.id}">배운 점 남기기</button>`:''}</div></article>`).join('')}${c.status==='waiting'?`<div class="context-note">${owner?'선배의 답변을 기다리고 있어. 자동으로 생성되는 답변은 없어.':'후배가 답변을 기다리고 있어. 상황을 확인하고 다음 행동을 알려줘.'}</div>`:''}</div>
 ${c.status!=='closed'?`<form id="chat-form" class="composer-area"><label class="sr-only" for="question-body">${owner?'추가 질문':'선배 답변'}</label><div class="home-composer"><textarea id="question-body" maxlength="5000" rows="2" placeholder="${owner?'추가로 궁금한 내용을 적어줘':'확인할 상황과 다음 행동을 짧게 정리해주세요'}">${esc(draft)}</textarea><button type="submit" class="btn">${owner?'보낼 내용 확인':'답변 등록'}</button></div>${!owner?`<label class="field-label" for="feedback-body">선배 피드백 <span class="muted">(선택)</span></label><textarea id="feedback-body" class="field compact-field" maxlength="500" placeholder="대화에서 확인한 행동이나 배운 점만 짚어주세요.">${esc(feedbackDraft)}</textarea>`:''}<p class="tiny muted">${owner?'전송 전 내용을 다시 확인해. 담당 선배에게만 공유돼.':'답변 저장 시 후배 알림함에 알림을 만들고, 등록된 기기로 푸시 전송을 요청해.'}</p></form>`:''}
 ${owner?`<details class="disclosure share-settings"><summary>이 상담의 노하우 재사용 설정</summary><p>상담 기록은 서비스 제공을 위해 저장해. 다른 사람을 위한 지식 자료로의 재사용은 별도 선택이야. 지금은 AI 학습·공개에 사용하지 않아.</p><p>현재: <strong>${c.reuse_consent?'재사용에 동의함':'재사용하지 않음'}</strong></p><button class="btn secondary small" data-reuse="${c.id}">${c.reuse_consent?'동의 철회':'재사용 동의 내용 확인'}</button></details>`:''}`;
}
function growthView(){const mineConvs=data.consultations.filter(mine);const feedback=data.consultation_messages.filter(m=>m.feedback&&mineConvs.some(c=>c.id===m.consultation_id));return `${heading('나의 성장기록','질문했던 것, 배운 점, 선배가 짚어준 점을 남겨보자.')}<div class="growth-layout"><section class="card"><h2>내 말로 남긴 배운 점</h2>${data.reflections.length?data.reflections.map(r=>`<article class="reflection"><p class="detail-text">${esc(r.body)}</p><button class="text-link" data-reflection="${r.consultation_id}">수정·삭제</button> · <button class="text-link" data-consult="${r.consultation_id}">대화 보기</button></article>`).join(''):'<p class="muted section-space">답변을 읽고 기억하고 싶은 내용을 한 줄씩 남겨봐.</p>'}</section><section class="card"><h2>선배가 짚어준 점</h2>${feedback.length?feedback.map(m=>`<article class="reflection"><p>${esc(m.feedback)}</p><p class="tiny muted">${esc(m.author_name)} · ${fmt(m.created_at)}</p><button class="text-link" data-consult="${m.consultation_id}">대화 보기</button></article>`).join(''):'<p class="muted section-space">선배가 직접 남긴 피드백이 여기에 모여.</p>'}</section></div><section class="section-space"><h2>질문 이력</h2>${mineConvs.map(card).join('')||'<p class="muted">아직 남긴 질문이 없어.</p>'}</section>`;}
function notificationsView(){return `${heading('알림','질문과 답변 도착 소식을 확인해줘.')}<div class="row wrap section-space"><button class="btn secondary small" data-action="refresh">새로 불러오기</button><button class="btn soft small" data-action="push-on">휴대폰 알림 설정</button></div>${[...data.notifications].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(n=>`<button class="history-card ${n.read_at?'':'unread-card'}" data-notification="${n.id}"><span class="badge ${n.read_at?'':'green'}">${n.read_at?'확인함':'새 알림'}</span><h3>${n.kind==='question'?'후배의 질문이 도착했어':'선배의 답변이 도착했어'}</h3><p>${fmt(n.created_at,{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} · 눌러서 대화 보기</p></button>`).join('')||empty('아직 도착한 알림이 없어.','답변은 이곳에서도 확인할 수 있어.')}`;}
function knowledgeView(){if(!staff())return empty('선배 전용 화면이야.','배정된 상담에서 작성한 노하우만 확인할 수 있어.');return `${heading('상담에서 쌓인 노하우','재사용에 동의한 상담의 답변을 검토용으로 모았어.')}<div class="notice">원문은 상담에 보관돼. 아래 초안은 개인정보·적용 조건을 검수한 후 별도 지식으로 정리해. 검수가 끝나도 AI가 자동으로 학습하지 않아.</div>${data.knowledge_candidates.map(k=>`<article class="card section-space"><span class="badge ${k.status==='reviewed'?'green':'amber'}">${k.status==='reviewed'?'정리·검수 완료':'검토 전 초안'} · AI 미사용</span><h3 class="section-space">${esc(k.question||'상담 답변을 노하우로 정리하기')}</h3>${k.answer?`<p class="detail-text">${esc(k.answer)}</p>`:''}<div class="row wrap"><button class="text-link" data-consult="${k.consultation_id}">원래 상담 확인</button>${data.profile.role==='admin'?`<button class="btn secondary small" data-knowledge="${k.id}">질문·답변 정리</button>`:''}</div></article>`).join('')||'<p class="muted section-space">동의받은 상담에 선배가 답하면 검토 후보가 생겨.</p>'}`;}
function settingsView(){return `${heading('설정','프로필과 알림, 내 기록을 관리해.')}<section class="card stack">${profileCard()}<div class="divider"></div><h2>알림</h2><p>${nativeAvailable()?'질문과 답변 소식을 휴대폰에서도 받아봐.':'앱 안의 알림함에서 질문과 답변을 확인할 수 있어.'}</p><div class="row wrap"><button class="btn secondary" data-action="push-on">휴대폰 알림 켜기</button><button class="btn ghost" data-action="push-off">휴대폰 알림 끄기</button></div><p class="tiny muted">잠금화면에는 상담 내용과 닉네임을 표시하지 않아.</p></section>${staff()?'<section class="card section-space"><button class="btn secondary" data-view="knowledge">상담에서 쌓인 노하우</button></section>':''}${preview()?`<section class="card section-space"><h2>둘러보기 역할 전환</h2><p>같은 브라우저의 가상 계정이야. 실제 권한 전환이 아니야.</p><div class="row wrap section-space"><button class="btn secondary" data-preview="junior">후배 화면</button><button class="btn secondary" data-preview="mentor">선배 답변 화면</button></div></section>`:''}<section class="card section-space stack"><h2>계정</h2>${import.meta.env.VITE_PRIVACY_URL?`<a href="${esc(import.meta.env.VITE_PRIVACY_URL)}" target="_blank" rel="noopener">개인정보 처리방침</a>`:'<p class="tiny muted">정식 출시 전 개인정보 처리방침과 운영 연락처가 연결되어야 해.</p>'}${import.meta.env.VITE_SUPPORT_EMAIL?`<a href="mailto:${esc(import.meta.env.VITE_SUPPORT_EMAIL)}">운영자에게 문의</a>`:''}<button class="btn secondary" data-action="logout">${preview()?'둘러보기 나가기':'로그아웃'}</button><button class="btn danger" data-action="delete-account">${preview()?'둘러보기 기록 초기화':'계정 및 내 상담 기록 삭제'}</button></section>`;}
function render(){
 const pages={home:homeView,history:listView,consultations:listView,chat:chatView,growth:growthView,notifications:notificationsView,settings:settingsView,knowledge:knowledgeView};
 $('#app').innerHTML=data?shell((pages[view]||homeView)()):authView();
 document.title='선물 · '+({home:'선배에게 물어봐',chat:'선배 상담',growth:'성장기록',settings:'설정'}[view]||'후배가 선배가 되는 날까지');
 if(view==='chat')requestAnimationFrame(()=>{const box=$('#chat-scroll');if(box)box.scrollTop=box.scrollHeight;});
}
function openDialog(title,body){dialogOpener=document.activeElement;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="row spread"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></div>${body}<p class="form-error" id="dialog-error" role="alert"></p></section></div>`;document.body.style.overflow='hidden';setTimeout(()=>$('.dialog textarea,.dialog input,.dialog button')?.focus(),0);}
function closeDialog(){if(busy)return;$('#modal-root').innerHTML='';document.body.style.overflow='';dialogOpener?.focus?.();dialogOpener=null;}
function shareDialog(){
 capture();if(!draft.trim()){toast('어떤 상황인지 먼저 적어줘.');return;}
 const c=view==='chat'?current():null;
 pending={consultationId:c?.id,category:c?.category||category,body:draft.trim(),feedback:feedbackDraft};
 openDialog('선배에게 보낼 내용 확인',`<p>닉네임·경력과 아래 내용이 담당 선배에게 공유돼.</p><div class="share-profile"><strong>${esc(nickname())}</strong> · ${esc(data.profile.career)}</div><form id="share-form"><label class="field-label" for="share-body">보낼 내용</label><textarea id="share-body" class="field" maxlength="5000" rows="6" required>${esc(pending.body)}</textarea><p class="field-hint">실명·거래처명·연락처 등은 빼고 상황만 남겨줘.</p><label class="check consent-check"><input id="share-consent" type="checkbox" required><span>위 내용을 확인했고, 상담을 위해 담당 선배에게 공유하는 데 동의해.</span></label>${!c?'<label class="check consent-check"><input id="reuse-consent" type="checkbox"><span><strong>선택 · 노하우 자료로 재사용</strong><br>상담 내용을 비식별화·검수해 다른 후배를 위한 지식 자료로 정리하는 데 동의해. 동의하지 않아도 상담할 수 있고, 상담 설정에서 철회할 수 있어. 현재 AI 학습에는 사용하지 않아.</span></label>':''}<div class="notice warm">${preview()?'둘러보기: 이 브라우저에만 저장되고 실제 알림은 전송되지 않아.':'접수된 상담은 서버에 저장돼. 선배에게 알림을 요청하며, 답변은 앱 알림함에서도 확인할 수 있어.'}</div><div class="actions"><button class="btn secondary" type="button" data-action="close-dialog">돌아가기</button><button class="btn" id="share-submit" type="submit" disabled>${preview()?'확인한 내용으로 체험 접수':'동의하고 질문 접수'}</button></div></form>`);
}
async function reload(){const fresh=await api.loadData();if(fresh&&!fresh.profile)throw new Error('프로필을 불러오지 못했어요. 다시 로그인해주세요.');data=fresh;}
async function mutate(fn,done){
 if(busy)return;busy=true;const buttons=[...document.querySelectorAll('button[type="submit"]')];buttons.forEach(b=>b.disabled=true);
 try{const result=await fn();busy=false;if(done)done(result);try{await reload();errorText='';render();}catch{errorText='저장은 완료됐지만 최신 화면을 불러오지 못했어. 다시 불러오기를 눌러줘.';if(data)render();toast(errorText);}return true;}
 catch(e){busy=false;const target=$('#dialog-error')||$('#auth-error');if(target)target.textContent=e.message||'처리하지 못했어. 입력 내용은 유지했으니 다시 시도해줘.';else toast(e.message||'저장하지 못했어. 다시 시도해줘.');buttons.forEach(b=>b.disabled=false);return false;}
}
function requestKey(payload){const k=JSON.stringify(payload);if(!questionRequests.has(k))questionRequests.set(k,crypto.randomUUID());return questionRequests.get(k);}
async function send(payload){const requestId=requestKey(payload);await mutate(()=>api.sendQuestion({...payload,requestId}),result=>{questionRequests.delete(JSON.stringify(payload));screenDrafts.delete(payload.consultationId||'home');draft='';feedbackDraft='';closeDialog();if(!payload.consultationId)active=result;view='chat';toast(preview()?'체험 내용을 이 브라우저에 저장했어.':'상담 내용을 저장했어. 알림은 앱 알림함에서도 확인할 수 있어.');});}
function profileDialog(){const bio=data.profile.bio||'';openDialog('내 프로필',`<form id="profile-form"><label for="nickname" class="field-label">닉네임</label><input id="nickname" class="field" minlength="2" maxlength="16" value="${esc(nickname())}" required><label for="career" class="field-label section-space">경력</label><select id="career" class="field">${CAREERS.map(c=>`<option ${c===data.profile.career?'selected':''}>${c}</option>`).join('')}</select><label for="profile-bio" class="field-label section-space">소개글 <span class="muted">(선택)</span></label><textarea id="profile-bio" class="field" rows="3" maxlength="100" placeholder="예: 첫 신고를 준비하는 1년 차예요. 차근차근 배우고 싶어요." aria-describedby="bio-help bio-count">${esc(bio)}</textarea><div class="row spread bio-helper"><span id="bio-help" class="tiny muted">나를 소개하는 말을 짧게 남겨줘.</span><span id="bio-count" class="tiny muted">${bio.length} / 100</span></div><p class="tiny muted">이미 접수한 상담에는 공유 당시 프로필이 남아. 작은 그림은 경력에 따라 달라지며 실력을 평가하는 표시는 아니야.</p><div class="actions"><button class="btn" type="submit">저장</button></div></form>`);}
document.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const form=e.target;
 if(form.id==='home-form'&&!staff())return shareDialog();
 if(form.id==='chat-form'){capture();const c=current();if(!c)return;if(mine(c))return shareDialog();return send({consultationId:c.id,body:draft.trim(),feedback:feedbackDraft,shareConsent:false});}
 if(form.id==='share-form'){if(!$('#share-consent').checked)return;return send({...pending,body:$('#share-body').value.trim(),shareConsent:true,reuseConsent:!!$('#reuse-consent')?.checked});}
 if(form.id==='profile-form')return mutate(()=>api.saveProfile($('#nickname').value,$('#career').value,$('#profile-bio').value),()=>{closeDialog();toast('프로필을 저장했어.');});
 if(form.id==='reflection-form')return mutate(()=>api.saveReflection(form.dataset.id,$('#reflection-body').value),()=>{closeDialog();toast('배운 점을 저장했어.');});
 if(form.id==='knowledge-form')return mutate(()=>api.reviewKnowledge(form.dataset.id,$('#knowledge-question').value,$('#knowledge-answer').value,$('#privacy-check').checked),()=>{closeDialog();toast('검수 기록을 저장했어. AI에는 사용하지 않아.');});
 if(form.id==='auth-form'){
  const email=$('#email').value.trim(),password=$('#password').value;busy=true;form.querySelector('[type="submit"]').disabled=true;
  try{const result=await(authMode==='signup'?api.signUp(email,password):api.signIn(email,password));if(authMode==='signup'&&!result.session){toast('이메일에서 가입 확인을 마친 뒤 로그인해줘.');authMode='login';render();}else{await reload();chooseGreeting();view='home';render();try{await resumePush();}catch{toast('로그인했어. 푸시 등록은 설정에서 다시 시도해줘.');}await openPushTarget();}}
  catch(err){if($('#auth-error'))$('#auth-error').textContent=err.message||'로그인하지 못했어. 다시 확인해줘.';else toast('화면을 불러오지 못했어. 다시 시도해줘.');}finally{busy=false;$('#auth-form [type="submit"]')?.removeAttribute('disabled');}
 }
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||busy)return;
 if(b.dataset.action==='kakao-login'){
  busy=true;b.disabled=true;
  try{await api.signInWithKakao();}
  catch(err){busy=false;b.disabled=false;const target=$('#auth-error');if(target)target.textContent=err.message||'카카오 로그인을 시작하지 못했어. 다시 시도해줘.';}
  return;
 }
 if(b.dataset.view){search='';statusFilter='all';favoritesOnly=false;navigate(b.dataset.view);return;}
 if(b.dataset.consult){navigate('chat',b.dataset.consult);return;}
 if(b.dataset.category){capture();category=b.dataset.category;render();$('#question-body').focus();return;}
 if(b.dataset.preview){await api.previewLogin(b.dataset.preview);draft='';feedbackDraft='';pending=null;active=null;screenDrafts.clear();await reload();chooseGreeting();view='home';render();return;}
 if(b.dataset.filter){capture();statusFilter=b.dataset.filter;render();return;}
 if(b.dataset.favorite){capture();await mutate(()=>api.favorite(b.dataset.favorite,!favorite(b.dataset.favorite)));return;}
 if(b.dataset.notification){const n=data.notifications.find(n=>n.id===b.dataset.notification);await mutate(()=>api.readNotification(n.id),()=>{active=n.consultation_id;draft='';feedbackDraft='';view='chat';});return;}
 if(b.dataset.reflection){const r=data.reflections.find(r=>r.consultation_id===b.dataset.reflection);openDialog('내 말로 남기는 배운 점',`<form id="reflection-form" data-id="${b.dataset.reflection}"><label class="field-label" for="reflection-body">기억할 것 · 직접 해본 것</label><textarea id="reflection-body" class="field" rows="5" maxlength="1500">${esc(r?.body||'')}</textarea><p class="tiny muted">내용을 비우고 저장하면 이 기록만 삭제돼.</p><div class="actions"><button class="btn" type="submit">저장</button></div></form>`);return;}
 if(b.dataset.reuse){const c=data.consultations.find(c=>c.id===b.dataset.reuse);openDialog(c.reuse_consent?'노하우 재사용 동의 철회':'노하우 재사용 동의',`<p>${c.reuse_consent?'검토 후보와 정리된 노하우를 삭제하고 앞으로 이 상담을 재사용 후보로 모으지 않아. 상담 원문은 유지돼.':'이 상담을 비식별화·검수해 다른 후배를 위한 지식 자료로 정리하는 데 동의할 수 있어. 상담 이용과는 별개이며 언제든 철회할 수 있어. 현재 AI 학습·공개에는 사용하지 않아.'}</p><div class="actions"><button class="btn secondary" data-action="close-dialog">취소</button><button class="btn" data-action="confirm-reuse" data-id="${c.id}" data-granted="${!c.reuse_consent}">${c.reuse_consent?'철회하기':'동의하기'}</button></div>`);return;}
 if(b.dataset.knowledge){const k=data.knowledge_candidates.find(k=>k.id===b.dataset.knowledge);openDialog('노하우 정리·검수',`<p>실명·거래처·개별 식별 정보를 제거하고 적용 조건을 확인해줘.</p><form id="knowledge-form" data-id="${k.id}"><label class="field-label" for="knowledge-question">일반화한 질문</label><textarea id="knowledge-question" class="field" maxlength="5000" required>${esc(k.question)}</textarea><label class="field-label section-space" for="knowledge-answer">검수한 선배 답변</label><textarea id="knowledge-answer" class="field" rows="6" maxlength="10000" required>${esc(k.answer)}</textarea><label class="check section-space"><input id="privacy-check" type="checkbox" required><span>개인정보 제거와 내용·적용 조건을 확인했어.</span></label><div class="actions"><button class="btn" type="submit">검수 기록 저장</button></div></form>`);return;}
 switch(b.dataset.action){
 case 'close-dialog':closeDialog();break;
 case 'profile':profileDialog();break;
 case 'auth-mode':authMode=authMode==='login'?'signup':'login';render();break;
 case 'favorites-only':favoritesOnly=!favoritesOnly;render();break;
 case 'refresh':capture();try{await reload();errorText='';render();toast('최신 내용을 불러왔어.');}catch{toast('연결을 확인해줘. 입력한 내용은 유지했어.');}break;
 case 'confirm-reuse':await mutate(()=>api.reuseConsent(b.dataset.id,b.dataset.granted==='true'),()=>closeDialog());break;
 case 'push-on':try{await enablePush(toast);}catch(err){toast(err.message);}break;
 case 'push-off':try{await disablePush();toast(nativeAvailable()?'이 기기의 푸시 등록을 해제했어.':'이 화면에는 휴대폰 푸시가 연결되지 않았어.');}catch{toast('알림 해제에 실패했어. 다시 시도해줘.');}break;
 case 'logout':try{await disablePush();await api.signOut();data=null;draft='';feedbackDraft='';pending=null;questionRequests.clear();screenDrafts.clear();render();}catch{toast('로그아웃을 완료하지 못했어. 연결을 확인하고 다시 시도해줘.');}break;
 case 'delete-account':openDialog(preview()?'둘러보기 기록 초기화':'계정과 내 상담 기록 삭제',`<p>${preview()?'이 브라우저의 모든 체험 상담과 답변을 삭제해.':'내 계정과 내가 요청한 상담·메시지·배운 점·알림·연결된 노하우 후보를 삭제해. 되돌릴 수 없어. 선배 계정은 운영자가 담당 상담을 먼저 정리해야 해.'}</p><div class="actions"><button class="btn secondary" data-action="close-dialog">취소</button><button class="btn danger" data-action="confirm-delete">삭제하기</button></div>`);break;
 case 'confirm-delete':await mutate(()=>api.deleteAccount(),()=>{closeDialog();data=null;draft='';feedbackDraft='';pending=null;questionRequests.clear();render();});break;
 }
});
document.addEventListener('input',e=>{
 if(e.target.id==='profile-bio')$('#bio-count').textContent=`${e.target.value.length} / 100`;
 if(e.target.id==='question-body')draft=e.target.value;
 if(e.target.id==='feedback-body')feedbackDraft=e.target.value;
 if(e.target.id==='share-body'){$('#share-consent').checked=false;$('#share-submit').disabled=true;}
 if(e.target.id==='history-search'){search=e.target.value;const start=e.target.selectionStart;render();$('#history-search').focus();$('#history-search').setSelectionRange(start,start);}
});
document.addEventListener('change',e=>{if(e.target.id==='share-consent')$('#share-submit').disabled=!e.target.checked||!$('#share-body').value.trim();});
document.addEventListener('keydown',e=>{const dialog=$('.dialog');if(!dialog)return;if(e.key==='Escape'){e.preventDefault();closeDialog();}if(e.key==='Tab'){const els=[...dialog.querySelectorAll('button:not(:disabled),input,textarea,select,a[href]')];if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0]?.focus();}}});
let polling=false;
async function updateNotice(){
 if(!data||document.hidden||busy||polling)return;polling=true;const userId=data.user.id;
 try{
  const fresh=await api.loadData();if(!data||data.user.id!==userId)return;
  if(!fresh){data=null;draft='';feedbackDraft='';screenDrafts.clear();render();return;}
  if(JSON.stringify(fresh)!==JSON.stringify(data)){
   if($('.dialog')||document.activeElement?.matches('input,textarea,select')){const el=$('#sync-note');if(el)el.innerHTML='<button class="text-link" data-action="refresh">새 내용이 있어 · 불러오기</button>';}
   else{capture();data=fresh;render();}
  }
 }catch{const el=$('#sync-note');if(el)el.innerHTML='<button class="text-link" data-action="refresh">연결을 확인하고 다시 불러오기</button>';}
 finally{polling=false;}
}
window.addEventListener('seonmul-refresh',updateNotice);
async function openPushTarget(){if(!data||!pendingDeepLink)return;try{await reload();const target=pendingDeepLink;pendingDeepLink=null;if(data.consultations.some(c=>c.id===target))navigate('chat',target);else toast('로그인한 계정으로 볼 수 없는 상담이야.');}catch{toast('연결을 확인하고 알림함을 다시 열어줘.');}}
window.addEventListener('seonmul-open-consultation',async e=>{pendingDeepLink=e.detail;await openPushTarget();});
window.addEventListener('storage',e=>{if(e.key==='seonmul.human-first.preview.v1')updateNotice();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateNotice();});
async function boot(){try{await initializePush(toast);}catch{}try{await reload();chooseGreeting();render();await openPushTarget();}catch{data=null;render();toast('서버에서 기록을 불러오지 못했어. 연결을 확인하고 다시 로그인해줘.');}try{await resumePush();}catch{toast('푸시 등록을 확인하지 못했어. 상담은 알림함에서도 볼 수 있어.');}clearInterval(refreshTimer);refreshTimer=setInterval(updateNotice,20000);}
boot();
