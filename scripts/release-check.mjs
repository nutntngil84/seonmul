import { loadEnv } from 'vite';
import { readFile } from 'node:fs/promises';
const env={...loadEnv('production',process.cwd(),''),...process.env};
const config=JSON.parse(await readFile('capacitor.config.json','utf8'));
const missing=[];
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_PRIVACY_URL','VITE_SUPPORT_EMAIL'])if(!env[key])missing.push(key);
for(const key of ['VITE_SUPABASE_URL','VITE_PRIVACY_URL'])if(env[key]&&!env[key].startsWith('https://'))missing.push(`${key}: HTTPS 필요`);
if(env.VITE_ENABLE_PREVIEW==='true')missing.push('운영 빌드에서는 VITE_ENABLE_PREVIEW=false 필요');
if(config.appId.includes('example'))missing.push('정식 앱 ID 결정 필요');
const clientKey=env.VITE_SUPABASE_PUBLISHABLE_KEY||'';
if(clientKey.startsWith('sb_secret_'))missing.push('브라우저에는 Supabase secret key를 사용할 수 없음');
if(clientKey.startsWith('eyJ')){try{if(JSON.parse(Buffer.from(clientKey.split('.')[1],'base64url').toString()).role!=='anon')missing.push('브라우저에는 legacy anon 키만 사용 가능');}catch{missing.push('잘못된 Supabase 공개 키');}}
if(missing.length){console.error('등록용 빌드를 중단합니다. 다음 설정이 필요합니다:\n- '+missing.join('\n- '));process.exit(1);}
console.log('기본 설정 확인 완료. 실제 서버·푸시·기기·스토어 심사는 별도 검증이 필요합니다.');
