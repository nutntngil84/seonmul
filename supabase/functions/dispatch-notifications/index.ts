import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { SignJWT, importPKCS8 } from 'npm:jose@6.1.3';

// Server only. Never bundle this function, CRON_SECRET, or provider keys in the app.
const env = (name: string) => { const v=Deno.env.get(name); if(!v)throw new Error(`Missing ${name}`);return v; };
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {auth:{persistSession:false,autoRefreshToken:false}});
type Job={job_id:string;claim_id:string;token:string;platform:string;notification_id:string;consultation_id:string;kind:string};
let googleToken:{value:string;expires:number}|null=null;
let appleToken:{value:string;expires:number}|null=null;
const timeout=()=>AbortSignal.timeout(15000);
async function secureEqual(a:string,b:string){
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
async function fcmAccess(){
 if(googleToken&&googleToken.expires>Date.now())return googleToken.value;
 const sa=JSON.parse(env('FCM_SERVICE_ACCOUNT_JSON'));
 const key=await importPKCS8(sa.private_key,'RS256');
 const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'})
 .setProtectedHeader({alg:'RS256'}).setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:timeout()});
 const payload=await response.json();if(!response.ok||!payload.access_token)throw new Error('FCM OAuth failed');
 googleToken={value:payload.access_token,expires:Date.now()+50*60*1000};return googleToken.value;
}
async function apnsAccess(){
 if(appleToken&&appleToken.expires>Date.now())return appleToken.value;
 const key=await importPKCS8(env('APNS_PRIVATE_KEY').replace(/\\n/g,'\n'),'ES256');
 const value=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:env('APNS_KEY_ID')}).setIssuer(env('APNS_TEAM_ID')).setIssuedAt().sign(key);
 appleToken={value,expires:Date.now()+45*60*1000};return value;
}
function notice(job:Job){return job.kind==='question'?{title:'선물 · 새 질문',body:'후배의 질문이 도착했어요. 선물에서 확인해주세요.'}:{title:'선물 · 선배 답변',body:'선배의 답변이 도착했어요. 선물에서 확인해주세요.'};}
async function send(job:Job):Promise<{ok:boolean;invalid:boolean;error?:string}>{
 const text=notice(job);
 if(job.platform==='android'){
  const sa=JSON.parse(env('FCM_SERVICE_ACCOUNT_JSON'));
  const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${await fcmAccess()}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token:job.token,notification:text,data:{consultation_id:job.consultation_id,notification_id:job.notification_id},android:{priority:'high',ttl:'86400s',notification:{channel_id:'consultations',tag:job.notification_id}}}}),signal:timeout()});
  const result=await response.json();const codes=(result.error?.details||[]).map((d:{errorCode?:string})=>d.errorCode);
  return {ok:response.ok,invalid:codes.includes('UNREGISTERED'),error:response.ok?undefined:`FCM_${response.status}_${result.error?.status||'ERROR'}`};
 }
 if(job.platform==='ios'){
  const host=env('APNS_ENVIRONMENT')==='production'?'https://api.push.apple.com':'https://api.sandbox.push.apple.com';
  const response=await fetch(`${host}/3/device/${encodeURIComponent(job.token)}`,{method:'POST',headers:{authorization:`bearer ${await apnsAccess()}`,'apns-topic':env('APNS_BUNDLE_ID'),'apns-push-type':'alert','apns-priority':'10','apns-collapse-id':job.notification_id,'apns-expiration':String(Math.floor(Date.now()/1000)+86400)},body:JSON.stringify({aps:{alert:text,sound:'default'},consultation_id:job.consultation_id,notification_id:job.notification_id}),signal:timeout()});
  const result=response.ok?{}:await response.json();
  return {ok:response.ok,invalid:response.status===410||result.reason==='BadDeviceToken',error:response.ok?undefined:`APNS_${response.status}_${result.reason||'ERROR'}`};
 }
 return {ok:false,invalid:false,error:'UNKNOWN_PLATFORM'};
}
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const secret=Deno.env.get('CRON_SECRET');
 if(!secret||secret.length<32||!await secureEqual(request.headers.get('x-worker-secret')||'',secret))return new Response('Unauthorized',{status:401});
 try{
  const claimed=await db.rpc('claim_notification_jobs',{p_limit:10});if(claimed.error)throw new Error('claim_failed');
  let accepted=0,failed=0;
  // Two groups of five fit inside a three-minute lease, including provider timeouts.
  const jobs=(claimed.data||[]) as Job[];
  for(let start=0;start<jobs.length;start+=5){
   await Promise.all(jobs.slice(start,start+5).map(async job=>{
    let result;try{result=await send(job);}catch{result={ok:false,invalid:false,error:'PROVIDER_CONNECTION_OR_CONFIG_ERROR'};}
    const finish=await db.rpc('finish_notification_job',{p_job_id:job.job_id,p_claim_id:job.claim_id,p_ok:result.ok,p_error:result.error||null,p_invalid_token:result.invalid});
    if(finish.error)failed++;else if(result.ok)accepted++;else failed++;
   }));
  }
  // Accepted means provider acceptance, never confirmed device delivery.
  return Response.json({claimed:jobs.length,provider_accepted:accepted,failed_or_retrying:failed});
 }catch{return Response.json({error:'notification_worker_failed'},{status:500});}
});
