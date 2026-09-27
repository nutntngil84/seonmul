import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { client, configured } from './backend.js';

const TOKEN_KEY='seonmul.push.registration.v1';
let currentToken = null;
try { currentToken=JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')?.token||null; } catch {}
let listenersReady = false;
let onChange = () => {};
const check = r => { if(r.error)throw r.error;return r.data; };
export function nativeAvailable(){return configured && Capacitor.isNativePlatform();}
export async function initializePush(callback) {
  onChange=callback;
  if(!nativeAvailable())return;
  if(!listenersReady){
    await PushNotifications.addListener('registration',async({value})=>{
      try{
        const user=check(await client.auth.getUser())?.user;if(!user)return;
        check(await client.rpc('register_device',{p_token:value,p_platform:Capacitor.getPlatform()}));
        currentToken=value;localStorage.setItem(TOKEN_KEY,JSON.stringify({token:value,userId:user.id}));onChange('푸시 수신 기기를 등록했어. 실제 수신 여부는 기기 설정과 네트워크에 따라 달라질 수 있어.');
      }catch {onChange('알림 기기 등록에 실패했어. 다시 시도해줘.');}
    });
    await PushNotifications.addListener('registrationError',()=>onChange('푸시 등록에 실패했어. 알림함에서 답변을 확인할 수 있어.'));
    await PushNotifications.addListener('pushNotificationReceived',()=>window.dispatchEvent(new CustomEvent('seonmul-refresh')));
    await PushNotifications.addListener('pushNotificationActionPerformed',({notification})=>{
      window.dispatchEvent(new CustomEvent('seonmul-open-consultation',{detail:notification.data?.consultation_id}));
    });
    listenersReady=true;
  }
}
export async function resumePush() {
  if(!nativeAvailable())return;
  const saved=JSON.parse(localStorage.getItem(TOKEN_KEY)||'null');
  const session=check(await client.auth.getSession())?.session;
  if(saved?.userId===session?.user.id&&(await PushNotifications.checkPermissions()).receive==='granted')await PushNotifications.register();
}
export async function enablePush(callback) {
  if(!nativeAvailable())throw new Error('휴대폰 푸시는 서버에 연결된 Android·iOS 앱에서 설정할 수 있어요. 웹에서는 앱 안의 알림함을 이용해줘.');
  await initializePush(callback);
  if(Capacitor.getPlatform()==='android')await PushNotifications.createChannel({id:'consultations',name:'선물 상담 알림',importance:4,description:'질문과 선배 답변 도착 알림'});
  let permission=await PushNotifications.checkPermissions();
  if(permission.receive==='prompt'||permission.receive==='prompt-with-rationale')permission=await PushNotifications.requestPermissions();
  if(permission.receive!=='granted')throw new Error('알림 권한이 꺼져 있어. 답변은 앱 안 알림함에서도 볼 수 있어.');
  await PushNotifications.register();
}
export async function disablePush() {
  if(!nativeAvailable())return;
  if(currentToken)check(await client.rpc('unregister_device',{p_token:currentToken}));
  await PushNotifications.unregister();currentToken=null;localStorage.removeItem(TOKEN_KEY);
}
