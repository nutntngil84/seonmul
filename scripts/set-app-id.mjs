import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
const next=process.argv[2];
if(!next||!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(next)||next.includes('example'))throw new Error('본인이 사용할 고유 앱 ID를 입력하세요. 예시 ID는 등록용으로 사용할 수 없습니다.');
const config=JSON.parse(await readFile('capacitor.config.json','utf8'));const prior=config.appId;
for(const name of ['android/app/build.gradle','android/app/src/main/res/values/strings.xml','ios/App/App.xcodeproj/project.pbxproj']){
 let content=await readFile(name,'utf8');content=content.replaceAll(prior,next);await writeFile(name,content);
}
const source=`android/app/src/main/java/${prior.replaceAll('.','/')}/MainActivity.java`;
const destination=`android/app/src/main/java/${next.replaceAll('.','/')}/MainActivity.java`;
let java=await readFile(source,'utf8');java=java.replaceAll(prior,next);await mkdir(path.dirname(destination),{recursive:true});await writeFile(source,java);if(source!==destination)await rename(source,destination);
config.appId=next;await writeFile('capacitor.config.json',JSON.stringify(config,null,2)+'\n');
console.log('앱 ID 수정 완료. Firebase와 Apple에서 같은 ID를 등록한 뒤 새로 빌드·동기화하세요.');
