const {chromium}=require('playwright');const path=require('path');
(async()=>{const dir=process.argv[2],out=process.argv[3],names=process.argv[4].split(',');
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1080}});
await p.goto('file://'+path.resolve(dir,'cards.html'));await p.waitForTimeout(800);
for(let i=0;i<names.length;i++){const el=await p.$('#c'+(i+1));await el.screenshot({path:path.join(out,names[i])});}
await b.close();})();
