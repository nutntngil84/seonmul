import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const respond=(body:object,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return respond({error:'method_not_allowed'},405);
 const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return respond({error:'unauthorized'},401);
 const auth=await admin.auth.getUser(token);
 if(auth.error||!auth.data.user)return respond({error:'unauthorized'},401);
 const uid=auth.data.user.id;
 const profile=await admin.from('profiles').select('role').eq('id',uid).single();
 if(profile.error)return respond({error:'profile_not_found'},400);
 // Staff must settle/reassign their cases before deleting. No arbitrary user_id accepted.
 if(profile.data.role!=='junior')return respond({error:'선배 계정은 담당 상담을 정리한 뒤 운영자에게 삭제를 요청해주세요.'},409);
 const deletion=await admin.auth.admin.deleteUser(uid);
 if(deletion.error)return respond({error:'account_deletion_failed'},500);
 // FK cascades remove owned consultations, messages, consents, notes, tokens, drafts and jobs.
 return respond({deleted:true});
});
