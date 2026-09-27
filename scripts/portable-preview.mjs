import {readFile,writeFile,readdir} from 'node:fs/promises';
const files=await readdir('demo-dist/assets');
const css=await readFile('demo-dist/assets/'+files.find(f=>f.endsWith('.css')),'utf8');
const js=await readFile('demo-dist/assets/'+files.find(f=>f.endsWith('.js')),'utf8');
let html=await readFile('demo-dist/index.html','utf8');
html=html.replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/,'').replace(/<link rel="stylesheet"[^>]*>/,'');
html=html.replace('</head>',`<style>${css}</style></head>`).replace('</body>',`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body>`);
await writeFile('seonmul_v0.3_preview.html',html);
console.log('seonmul_v0.3_preview.html');
