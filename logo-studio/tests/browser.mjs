import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,readFile,readdir,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

const scratch=await mkdtemp(path.join(tmpdir(),'beeglobal-browser-'));
const downloads=path.join(scratch,'downloads');await mkdir(downloads);
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu',
  '--remote-debugging-port=0',`--user-data-dir=${scratch}`,'about:blank'
],{stdio:['ignore','ignore','pipe']});
let ws;const pending=new Map();let id=0;const errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){const v=await fn();if(v)return v;await delay(80);}throw new Error(`Timed out: ${label}`);}
function zipEntries(bytes){
  const entries=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.toString('utf8',offset+30,offset+30+nameLength),start=offset+30+nameLength+extraLength;
    entries.set(name,bytes.subarray(start,start+size));offset=start+size;
  }
  return entries;
}
try{
  const port=await waitFor(async()=>{try{return Number((await readFile(path.join(scratch,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{return null;}},'Chrome startup');
  const target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x=>x.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  await send('Runtime.enable');await send('Page.enable');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1400,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});
  await waitFor(()=>evaluate(`document.readyState==='complete' && !!document.querySelector('#sample')`),'app loaded');
  assert.equal(await evaluate(`document.querySelector('#download-all').disabled`),true);
  await evaluate(`document.querySelector('#sample').click()`);
  await waitFor(()=>evaluate(`!document.querySelector('#download-all').disabled`),'sample processed');
  assert.equal(await evaluate(`document.querySelector('.portfolio-image').naturalWidth`),113);
  assert.equal(await evaluate(`document.querySelector('.portfolio-image').naturalHeight`),29);
  assert.equal(await evaluate(`document.querySelector('#spotlight-image').naturalWidth`),360);
  assert.equal(await evaluate(`document.querySelector('#spotlight-image').naturalHeight`),148);
  await evaluate(`document.querySelector('#download-all').click()`);
  const zip=await waitFor(async()=>{const f=(await readdir(downloads)).find(n=>n.endsWith('.zip'));return f&&path.join(downloads,f);},'ZIP download');
  const bytes=await readFile(zip);assert.equal(bytes.readUInt32LE(0),0x04034b50);
  assert.deepEqual([...zipEntries(bytes).keys()],['whizzo-homepage.png','whizzo-spotlight.png','whizzo-details.png']);
  const firstNameLength=bytes.readUInt16LE(26),png=30+firstNameLength;
  assert.equal(bytes.readUInt32BE(png+16),113);assert.equal(bytes.readUInt32BE(png+20),29);
  const second=png+bytes.readUInt32LE(18),secondPng=second+30+bytes.readUInt16LE(second+26);
  assert.equal(bytes.readUInt32BE(secondPng+16),360);assert.equal(bytes.readUInt32BE(secondPng+20),148);
  // Padding and upload resolution must not determine the displayed logo size.
  await evaluate(`(async()=>{const img=new Image();img.src='./assets/whizzo.png';await img.decode();const c=document.createElement('canvas');c.width=1400;c.height=500;const x=c.getContext('2d');x.drawImage(img,135,105,1130,290);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'padded-whizzo.png',{type:'image/png'}));document.querySelector('#file').files=dt.files;document.querySelector('#file').dispatchEvent(new Event('change'));})()`);
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='padded-whizzo.png'&&document.querySelector('.portfolio-image').src.startsWith('data:')`),'padded upload');
  assert.ok(Math.abs(await evaluate(`document.querySelector('.portfolio-image').naturalWidth`)-113)<=2,'padding/resolution should not alter recognized scale');
  // Uploaded SVG has substantial whitespace and detached artwork; trimming must preserve both shapes.
  const svg=path.join(scratch,'test-logo.svg');await writeFile(svg,'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect x="100" y="100" width="250" height="80" fill="#154f45"/><circle cx="390" cy="110" r="10" fill="#154f45"/></svg>');
  const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#file'});
  await send('DOM.setFileInputFiles',{nodeId,files:[svg]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='test-logo.svg' && document.querySelector('.portfolio-image').src.startsWith('data:')`),'SVG upload');
  assert.match(await evaluate(`document.querySelector('#filemeta').textContent`),/30[01] × 8[01] artwork/);
  // Common SVG gradient styles can reference local definitions without external loading.
  const gradient=path.join(scratch,'gradient.svg');await writeFile(gradient,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="200" height="100" style="fill:url(&quot;#g&quot;)"/></svg>');
  await send('DOM.setFileInputFiles',{nodeId,files:[gradient]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='gradient.svg'&&document.querySelector('.portfolio-image').src.startsWith('data:')`),'SVG gradient upload');
  assert.equal(await evaluate(`document.querySelectorAll('input[type=range]').length`),0);
  // Automatic margin trimming keeps white artwork inside the colored mark intact.
  await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,400,200);x.fillStyle='#124f45';x.fillRect(100,70,200,60);x.fillStyle='white';x.fillRect(180,80,40,40);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'white-background.png',{type:'image/png'}));document.querySelector('#file').files=dt.files;document.querySelector('#file').dispatchEvent(new Event('change'));})()`);
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='white-background.png'&&document.querySelector('#filemeta').textContent.includes('artwork')`),'opaque upload');
  assert.match(await evaluate(`document.querySelector('#filemeta').textContent`),/20[0-2] × 6[0-2] artwork/);
  assert.equal(await evaluate(`(async()=>{const img=document.querySelector('.portfolio-image');await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);return Array.from(x.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data).join(',');})()`),'255,255,255,255');
  // Low-contrast white artwork must be held for the studio, never handed to the client to resize.
  const white=path.join(scratch,'white-mark.svg');await writeFile(white,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="10" y="10" width="180" height="80" fill="white"/></svg>');
  await send('DOM.setFileInputFiles',{nodeId,files:[white]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='white-mark.svg'&&document.querySelector('#decision').textContent==='Studio review needed'`),'studio review');
  assert.equal(await evaluate(`document.querySelector('#download-all').disabled`),true);
  assert.match(await evaluate(`document.querySelector('#status').textContent`),/no file has been submitted/);
  // Bulk uploads appear together in every website context; review items remain visible but stay out of the ZIP.
  await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve('dist/assets/whizzo.png'),path.resolve('dist/assets/references/telora.svg'),white]});
  await waitFor(()=>evaluate(`document.querySelectorAll('#bulk-home-grid .bulk-item').length===3`),'bulk previews');
  assert.equal(await evaluate(`document.querySelector('#batch-demo').hidden`),false);
  assert.equal(await evaluate(`document.querySelectorAll('#bulk-spotlight-grid .bulk-item').length`),3);
  assert.equal(await evaluate(`document.querySelectorAll('#bulk-detail-grid .bulk-detail-row').length`),3);
  assert.equal(await evaluate(`document.querySelectorAll('#bulk-detail-grid .bulk-detail-row .detail-facts').length`),3);
  assert.equal(await evaluate(`document.querySelectorAll('.single-preview:not([hidden])').length`),0);
  assert.equal(await evaluate(`document.querySelector('#download-all').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('.bulk-downloads').hidden`),false);
  assert.match(await evaluate(`document.querySelector('#bulk-home-grid').textContent`),/Studio review/);
  assert.equal(await evaluate(`document.querySelector('#download-batch').disabled`),false);
  for(const kind of ['homepage','spotlight','details'])assert.equal(await evaluate(`document.querySelector('#download-batch-${kind}').disabled`),false);
  await evaluate(`document.querySelector('#download-batch').click()`);
  const batchZip=await waitFor(async()=>{const f=path.join(downloads,'beeglobal-logos.zip');try{return await readFile(f);}catch{return null;}},'bulk ZIP download');
  assert.ok(batchZip.includes(Buffer.from('01-whizzo-homepage.png')));
  assert.ok(batchZip.includes(Buffer.from('01-whizzo-spotlight.png')));
  assert.ok(batchZip.includes(Buffer.from('01-whizzo-details.png')));
  const bulkFiles=zipEntries(batchZip);
  for(const kind of ['homepage','spotlight','details']){
    const svg=bulkFiles.get(`02-telora-${kind}.svg`)?.toString('utf8');
    assert.ok(svg?.includes('<svg'),'SVG upload must remain SVG in a mixed bulk ZIP');
    assert.ok(svg.includes('<path')||svg.includes('<g'),'vector artwork must be preserved');
  }
  assert.equal(batchZip.includes(Buffer.from('white-mark-homepage.png')),false);
  for(const kind of ['homepage','spotlight','details']){
    await evaluate(`document.querySelector('#download-batch-${kind}').click()`);
    const sectionZip=await waitFor(async()=>{try{return await readFile(path.join(downloads,`beeglobal-${kind}-logos.zip`));}catch{return null;}},`${kind} bulk ZIP download`);
    const names=[...zipEntries(sectionZip).keys()];
    assert.deepEqual(names,[`01-whizzo-${kind}.png`,`02-telora-${kind}.svg`]);
  }
  await send('DOM.setFileInputFiles',{nodeId,files:[white,white]});
  await waitFor(()=>evaluate(`document.querySelectorAll('#bulk-home-grid .bulk-item').length===2 && document.querySelector('#filemeta').textContent.includes('0 ready')`),'all-review bulk upload');
  assert.equal(await evaluate(`document.querySelector('.bulk-downloads').hidden`),false);
  for(const kind of ['homepage','spotlight','details'])assert.equal(await evaluate(`document.querySelector('#download-batch-${kind}').disabled`),true);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1400,deviceScaleFactor:1,mobile:false});
  const bulkPreview=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(new URL('../artifacts/bulk.png',import.meta.url),Buffer.from(bulkPreview.data,'base64'));
  await evaluate(`(async()=>{const blob=await (await fetch('./assets/whizzo.png')).blob();const dt=new DataTransfer();for(let i=1;i<=30;i++)dt.items.add(new File([blob],'logo-'+i+'.png',{type:'image/png'}));const input=document.querySelector('#file');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await waitFor(()=>evaluate(`document.querySelectorAll('#bulk-home-grid .bulk-item').length===30`),'30-logo homepage preview',30000);
  assert.equal(await evaluate(`document.querySelectorAll('#bulk-spotlight-grid .bulk-item').length`),30);
  assert.equal(await evaluate(`document.querySelectorAll('#bulk-detail-grid .bulk-detail-row').length`),30);
  assert.equal(await evaluate(`document.querySelector('#download-batch').disabled`),false);
  await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve('tests/fixtures/gnikul.png')]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='gnikul.png'`),'Agnikul upload');
  const agnikulWidth=await evaluate(`document.querySelector('.portfolio-image').naturalWidth`);
  assert.ok(agnikulWidth<=175,'Agnikul should not spread to the 206 px limit');
  assert.equal(await evaluate(`document.querySelector('#download-all').disabled`),false,'calibrated Agnikul should remain downloadable');
  await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve('dist/assets/references/telora.svg')]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='telora.svg'`),'Telora upload');
  assert.match(await evaluate(`document.querySelector('#portfolio-size').textContent`),/SVG$/);
  await evaluate(`document.querySelector('#download-all').click()`);
  const svgZip=await waitFor(async()=>{try{return await readFile(path.join(downloads,'telora-beeglobal.zip'));}catch{return null;}},'SVG ZIP download');
  const svgFiles=zipEntries(svgZip);
  assert.deepEqual([...svgFiles.keys()],['telora-homepage.svg','telora-spotlight.svg','telora-details.svg']);
  for(const kind of ['homepage','spotlight','details']){
    const svg=svgFiles.get(`telora-${kind}.svg`)?.toString('utf8');
    assert.ok(svg?.includes('<svg'),'SVG ZIP must contain SVG files');
    assert.ok(svg.includes('<path')||svg.includes('<g'),'vector artwork must remain in the export');
    assert.match(svg,kind==='spotlight'?/width="360" height="148"/:/width="\d+" height="\d+"/);
    const exported=`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const appearance=await evaluate(`(async()=>{const img=new Image();img.src=${JSON.stringify(exported)};await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++;return {width:c.width,height:c.height,visible};})()`);
    assert.ok(appearance.visible>100,'exported SVG should render visible artwork');
    assert.equal(appearance.width,kind==='spotlight'?360:await evaluate(`document.querySelector('.portfolio-image').naturalWidth`));
    assert.equal(appearance.height,kind==='spotlight'?148:await evaluate(`document.querySelector('.portfolio-image').naturalHeight`));
  }
  for(const kind of ['homepage','spotlight','details']){
    await evaluate(`document.querySelector('#download-${kind}').click()`);
    const individualSvg=await waitFor(async()=>{try{return await readFile(path.join(downloads,`telora-${kind}.svg`),'utf8');}catch{return null;}},`individual ${kind} SVG download`);
    assert.equal(individualSvg,svgFiles.get(`telora-${kind}.svg`).toString('utf8'));
  }
  const teloraWidth=await evaluate(`document.querySelector('.portfolio-image').naturalWidth`);
  assert.ok(teloraWidth>=110&&teloraWidth<=120,'Telora remains at its established scale');
  await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve('dist/assets/references/tractrix.svg')]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='tractrix.svg'`),'Tractrix upload');
  const tractrixWidth=await evaluate(`document.querySelector('.portfolio-image').naturalWidth`);
  assert.ok(tractrixWidth<130,'heavy Tractrix artwork should sit closer to Telora');
  await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve('tests/fixtures/stepchanges.png')]});
  await waitFor(()=>evaluate(`document.querySelector('#filename').textContent==='stepchanges.png'`),'StepChanges upload');
  const stepchangesWidth=await evaluate(`document.querySelector('.portfolio-image').naturalWidth`);
  assert.ok(stepchangesWidth<160,'StepChanges should be smaller beside Telora');
  const stepchangesHeight=await evaluate(`document.querySelector('.portfolio-image').naturalHeight`);
  const stepchangesData=`data:image/png;base64,${(await readFile(path.resolve('tests/fixtures/stepchanges.png'))).toString('base64')}`;
  const stepchangesMetrics=await evaluate(`(async()=>{const img=new Image();img.src=${JSON.stringify(stepchangesData)};await img.decode();const m=await import('./optical.mjs');const x=(await m.measureImage(img)).metrics;return {ratio:x.ratio,density:x.density,coverage:x.coverage};})()`);
  console.log('Calibrated portfolio widths:',{agnikulWidth,teloraWidth,tractrixWidth,stepchangesWidth});
  console.log('StepChanges metrics:',{stepchangesHeight,...stepchangesMetrics});
  await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve('dist/assets/references/flywheel.svg'),path.resolve('dist/assets/references/furnishka.svg'),path.resolve('tests/fixtures/gnikul.png'),path.resolve('tests/fixtures/stepchanges.png'),path.resolve('dist/assets/references/telora.svg'),path.resolve('dist/assets/references/tractrix.svg')]});
  await waitFor(()=>evaluate(`document.querySelectorAll('#bulk-detail-grid .bulk-detail-row').length===6`),'calibrated comparison');
  const calibratedPreview=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(new URL('../artifacts/calibrated-comparison.png',import.meta.url),Buffer.from(calibratedPreview.data,'base64'));
  // Save reference measurements and an honest leave-one-out audit for developer inspection.
  const audit=await evaluate(`(async()=>{const m=await import('./optical.mjs');const refs=await m.calibrateReferences();return refs.map(r=>{const d=m.decideSize(r.metrics,refs.filter(o=>o.name!==r.name));return {name:r.name,original:[r.visibleWidth,r.visibleHeight],predicted:[d.portfolio.width,d.portfolio.height],density:r.metrics.density,coverage:r.metrics.coverage,targetArea:d.targetArea,targetInk:d.targetInk,neighbors:d.matched,review:d.review,widthError:Math.abs(d.portfolio.width/r.visibleWidth-1)};});})()`);
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await writeFile(new URL('../artifacts/calibration-audit.json',import.meta.url),JSON.stringify(audit,null,2));
  assert.equal(audit.find(r=>r.name==='Tractrix').review,true,'unrecognized heavy artwork should be held for review');
  console.log('Leave-one-out reference audit:',JSON.stringify(audit.map(r=>({name:r.name,widthError:Math.round(r.widthError*100),review:r.review}))));
  await evaluate(`document.querySelector('#sample').click()`);await waitFor(()=>evaluate(`document.querySelector('#filename').textContent.includes('sample')&&!document.querySelector('#download-all').disabled`),'restore sample');
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(new URL('../artifacts/desktop.png',import.meta.url),Buffer.from(desktop.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
  const active=await evaluate(`(()=>{const r=document.querySelector('.active-card').getBoundingClientRect();return {left:r.left,right:r.right};})()`);assert.ok(active.left>=0&&active.right<=390);
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(new URL('../artifacts/mobile.png',import.meta.url),Buffer.from(mobile.data,'base64'));
  await evaluate(`document.querySelector('#clear').click()`);assert.equal(await evaluate(`document.querySelector('#download-all').disabled`),true);
  // Developer comparison sheet: current website scale alongside the held-out prediction.
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`(async()=>{const m=await import('./optical.mjs'),refs=await m.calibrateReferences();document.body.innerHTML='';document.body.style.cssText='background:#eee;padding:24px;font:12px Arial;color:#222';const title=document.createElement('h2');title.textContent='Reference audit: current website / prediction with this logo held out';document.body.append(title);for(const r of refs){const d=m.decideSize(r.metrics,refs.filter(o=>o.name!==r.name)),row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:20px;margin:8px;background:white;padding:10px';const label=document.createElement('span');label.style.width='200px';label.textContent=r.name+(d.review?' — studio review':'');row.append(label);const img=new Image();img.src=r.src;await img.decode();const measured=await m.measureImage(img),b=measured.metrics.bounds;for(const size of [{width:r.visibleWidth,height:r.visibleHeight},d.portfolio]){const c=document.createElement('canvas');c.width=280;c.height=100;c.style.background='#fafafa';c.getContext('2d').drawImage(measured.canvas,b.x,b.y,b.width,b.height,(280-size.width)/2,(100-size.height)/2,size.width,size.height);row.append(c);}document.body.append(row);}})()`);
  const sheet=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(new URL('../artifacts/reference-comparison.png',import.meta.url),Buffer.from(sheet.data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: sample, SVG upload, all-logo previews and bulk ZIP, transparent trimming, automatic sizing, preserved white artwork, studio review gate, reset, mobile layout.');
  console.log(`Screenshots: logo-studio/artifacts/desktop.png and mobile.png`);
}finally{
  ws?.close();chrome.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));
}
