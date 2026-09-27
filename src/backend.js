import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const previewAllowed = !configured && import.meta.env.VITE_ENABLE_PREVIEW === 'true';
export const client = configured ? createClient(url, key) : null;
export const isPreview = () => !configured;
const DATA_KEY = 'seonmul.human-first.preview.v1';
const ACTOR_KEY = 'seonmul.preview.actor';
export const PREVIEW_JUNIOR = '11111111-1111-4111-8111-111111111111';
export const PREVIEW_MENTOR = '22222222-2222-4222-8222-222222222222';
let actor = sessionStorage.getItem(ACTOR_KEY);
const initial = () => ({
  profiles: [
    { id: PREVIEW_JUNIOR, nickname: '엠버', career: '1년 차', role: 'junior' },
    { id: PREVIEW_MENTOR, nickname: '선배 체험', career: '4년 차 이상', role: 'admin' }
  ],
  mentors: [{ user_id: PREVIEW_MENTOR, display_name: '선배 체험', accepting: true }],
  consultations: [], consultation_messages: [], notifications: [], reflections: [], favorites: [], knowledge_candidates: [], consents: [],
});
function readPreview() { return JSON.parse(localStorage.getItem(DATA_KEY) || 'null') || initial(); }
function writePreview(data) { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
function check(result) { if (result.error) throw result.error; return result.data; }

export async function session() {
  if (configured) return check(await client.auth.getSession())?.session?.user || null;
  return previewAllowed && actor ? { id: actor } : null;
}
export async function signIn(email, password) { return check(await client.auth.signInWithPassword({ email, password })); }
export async function signUp(email, password) { return check(await client.auth.signUp({ email, password })); }
export async function signInWithKakao() {
  if (!configured) throw new Error('로그인 서버 연결을 확인해주세요.');
  return check(await client.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: window.location.origin }
  }));
}
export async function previewLogin(role = 'junior') {
  if (!previewAllowed) throw new Error('둘러보기 모드가 꺼져 있습니다.');
  actor = role === 'junior' ? PREVIEW_JUNIOR : PREVIEW_MENTOR;
  sessionStorage.setItem(ACTOR_KEY, actor);
  if (!localStorage.getItem(DATA_KEY)) writePreview(initial());
}
export async function signOut() {
  if (configured) check(await client.auth.signOut());
  actor = null; sessionStorage.removeItem(ACTOR_KEY);
}
async function all(table) {
  const rows = [];
  for (let page = 0; ; page++) {
    const data = check(await client.from(table).select('*').order(table === 'profiles' ? 'id' : table === 'mentors' ? 'user_id' : table === 'reflections' || table === 'favorites' ? 'consultation_id' : 'id').range(page * 500, page * 500 + 499));
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function loadData() {
  const user = await session(); if (!user) return null;
  if (configured) {
    const tables = ['profiles','mentors','consultations','consultation_messages','notifications','reflections','favorites','knowledge_candidates'];
    const rows = await Promise.all(tables.map(all));
    return { ...Object.fromEntries(tables.map((t,i) => [t,rows[i]])), user, profile: rows[0].find(p => p.id === user.id) };
  }
  const data = readPreview();
  const consultations = data.consultations.filter(c => c.user_id === actor || c.mentor_id === actor);
  const ids = new Set(consultations.map(c => c.id));
  return { ...data, user, profile: data.profiles.find(p => p.id === actor), consultations,
    consultation_messages: data.consultation_messages.filter(m => ids.has(m.consultation_id)),
    notifications: data.notifications.filter(n => n.recipient_id === actor),
    reflections: data.reflections.filter(r => r.user_id === actor), favorites: data.favorites.filter(f => f.user_id === actor),
    knowledge_candidates: actor === PREVIEW_MENTOR ? data.knowledge_candidates : [] };
}
function previewMessage(data, c, body, requestId, kind, feedback='') {
  const profile = data.profiles.find(p => p.id === actor);
  const message = { id:id(), consultation_id:c.id, author_id:actor, author_kind:kind, author_name:profile.nickname, body, feedback, request_id:requestId, created_at:now() };
  data.consultation_messages.push(message);
  const recipient = kind === 'junior' ? c.mentor_id : c.user_id;
  data.notifications.push({ id:id(), recipient_id:recipient, consultation_id:c.id, message_id:message.id, kind:kind==='junior'?'question':'answer', created_at:now(), read_at:null });
  if (kind === 'mentor' && c.reuse_consent) data.knowledge_candidates.push({ id:id(), consultation_id:c.id, source_message_id:message.id, question:'', answer:'', status:'draft', created_at:now() });
  c.status = kind === 'junior' ? 'waiting' : 'answered'; c.updated_at = now();
  return message.id;
}
export async function sendQuestion({ consultationId, requestId, category, body, shareConsent, reuseConsent=false, feedback='' }) {
  if (!body.trim() || body.length > 5000) throw new Error('메시지는 1~5000자로 적어주세요.');
  if (configured) {
    return check(await client.rpc(consultationId ? 'send_consultation_message' : 'submit_question', consultationId
      ? { p_consultation_id:consultationId,p_request_id:requestId,p_body:body,p_share_consent:shareConsent,p_feedback:feedback }
      : { p_request_id:requestId,p_category:category,p_body:body,p_share_consent:shareConsent,p_reuse_consent:reuseConsent }));
  }
  const data=readPreview();
  const duplicate=data.consultation_messages.find(m=>m.request_id===requestId);
  if(duplicate) return consultationId?duplicate.id:duplicate.consultation_id;
  let c=data.consultations.find(c=>c.id===consultationId);
  const kind=c && c.mentor_id===actor ? 'mentor':'junior';
  if(kind==='junior'&&!shareConsent) throw new Error('공유 내용을 확인하고 동의해주세요.');
  if(!c){
    const profile=data.profiles.find(p=>p.id===actor);
    const mentor=data.mentors.find(m=>m.accepting&&m.user_id!==actor);if(!mentor)throw new Error('현재 상담을 받을 다른 선배가 없어. 질문은 전송되지 않았어.');
    c={ id:id(),user_id:actor,mentor_id:mentor.user_id,nickname:profile.nickname,career:profile.career,category,title:body.slice(0,60),status:'waiting',reuse_consent:reuseConsent,created_at:now(),updated_at:now() };
    data.consultations.push(c);
  }
  const messageId=previewMessage(data,c,body,requestId,kind,feedback);
  writePreview(data); return consultationId?messageId:c.id;
}
export async function saveProfile(nickname, career, bio='') {
  if ([...nickname.trim()].length<2 || [...nickname.trim()].length>16) throw new Error('닉네임은 2~16자로 적어주세요.');
  if(bio.length>100)throw new Error('소개글은 100자 이내로 적어주세요.');
  if(configured) return check(await client.from('profiles').update({ nickname:nickname.trim(),career,bio:bio.trim() }).eq('id',(await session()).id));
  const data=readPreview();Object.assign(data.profiles.find(p=>p.id===actor),{nickname:nickname.trim(),career,bio:bio.trim()});writePreview(data);
}
export async function favorite(cid, enabled) {
  const user=await session();
  if(configured) return check(await(enabled ? client.from('favorites').upsert({consultation_id:cid,user_id:user.id}) : client.from('favorites').delete().eq('consultation_id',cid).eq('user_id',user.id)));
  const data=readPreview();data.favorites=data.favorites.filter(f=>!(f.consultation_id===cid&&f.user_id===actor));if(enabled)data.favorites.push({consultation_id:cid,user_id:actor});writePreview(data);
}
export async function saveReflection(cid,body) {
  const user=await session();const value={consultation_id:cid,user_id:user.id,body:body.trim(),updated_at:now()};
  if(configured)return check(await(body.trim()?client.from('reflections').upsert(value):client.from('reflections').delete().eq('consultation_id',cid).eq('user_id',user.id)));
  const data=readPreview();data.reflections=data.reflections.filter(r=>!(r.consultation_id===cid&&r.user_id===actor));if(body.trim())data.reflections.push(value);writePreview(data);
}
export async function readNotification(nid) {
  if(configured)return check(await client.from('notifications').update({read_at:now()}).eq('id',nid));
  const data=readPreview();const n=data.notifications.find(n=>n.id===nid&&n.recipient_id===actor);if(n)n.read_at=now();writePreview(data);
}
export async function reuseConsent(cid,granted) {
  if(configured)return check(await client.rpc('set_reuse_consent',{p_consultation_id:cid,p_granted:granted}));
  const data=readPreview();const c=data.consultations.find(c=>c.id===cid&&c.user_id===actor);if(!c)throw new Error('권한이 없습니다.');c.reuse_consent=granted;
  if(!granted)data.knowledge_candidates=data.knowledge_candidates.filter(k=>k.consultation_id!==cid);
  else for(const m of data.consultation_messages.filter(m=>m.consultation_id===cid&&m.author_kind==='mentor'))if(!data.knowledge_candidates.some(k=>k.source_message_id===m.id))data.knowledge_candidates.push({id:id(),consultation_id:cid,source_message_id:m.id,question:'',answer:'',status:'draft',created_at:now()});
  writePreview(data);
}
export async function reviewKnowledge(kid,question,answer,checked) {
  if(configured)return check(await client.rpc('review_knowledge',{p_id:kid,p_question:question,p_answer:answer,p_privacy_checked:checked}));
  if(actor!==PREVIEW_MENTOR||!checked)throw new Error('검수 확인이 필요합니다.');
  const data=readPreview();Object.assign(data.knowledge_candidates.find(k=>k.id===kid),{question,answer,status:'reviewed',reviewed_at:now(),reviewed_by:actor});writePreview(data);
}
export async function deleteAccount() {
  if(configured){check(await client.functions.invoke('delete-account'));await client.auth.signOut({scope:'local'});}
  else {localStorage.removeItem(DATA_KEY);await signOut();}
}
