import { safeName, makeZip } from './core.mjs';
import { SPOTLIGHT } from './profiles.mjs';
import { measureImage, calibrateReferences, decideSize } from './optical.mjs';
let referencePromise;
function references(){return referencePromise ||= calibrateReferences().catch(error=>{referencePromise=null;throw error;});}

const $=id=>document.getElementById(id);
const fileInput=$('file'), status=$('status');
const exportButtons=[$('download-all'),$('download-homepage'),$('download-spotlight'),$('download-details')];
let source=null, outputs=null, generation=0, entries=[];

function say(message,error=false){status.textContent=message;status.classList.toggle('error',error);status.classList.remove('review');}
function ready(value){exportButtons.forEach(button=>button.disabled=!value);}
function emptyPreview(){document.querySelectorAll('.processed').forEach(img=>{img.hidden=true;img.removeAttribute('src');});document.querySelectorAll('.placeholder').forEach(el=>el.hidden=false);}

async function processLogo(file,isSample=false){
  let url;
  try{
    if(file.size>15*1024*1024)throw new Error('Choose a logo smaller than 15 MB.');
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['png','jpg','jpeg','webp','svg'].includes(ext))throw new Error('Please choose an SVG, PNG, JPG or WebP file.');
    const svg=ext==='svg';let blob=file;
    if(svg){
      const text=await file.text();
      const doc=new DOMParser().parseFromString(text,'image/svg+xml');
      if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw new Error('This SVG could not be read. Try exporting it again.');
      // Only static, self-contained SVG artwork may be exported again.
      for(const n of doc.querySelectorAll('*')){
        if(['script','foreignObject','iframe','animate','animateTransform','set','a'].includes(n.localName))throw new Error('Use a static SVG with embedded artwork.');
        for(const a of n.attributes){
          if(/^on/i.test(a.name))throw new Error('Use a plain SVG without interactive content.');
          if((a.localName==='href'||a.localName==='src')&&!/^(#|data:image\/(png|jpeg|webp);base64,)/i.test(a.value))throw new Error('This SVG links to an outside file. Embed the artwork before uploading.');
          if(/url\(\s*([^)]*)\)/i.test(a.value)&&[...a.value.matchAll(/url\(\s*([^)]*)\)/gi)].some(m=>!m[1].trim().replace(/^["']|["']$/g,'').startsWith('#')))throw new Error('This SVG links to an outside file. Embed the artwork before uploading.');
        }
      }
      const styles=[...doc.querySelectorAll('style')].map(n=>n.textContent).join(' ')+[...doc.querySelectorAll('[style]')].map(n=>n.getAttribute('style')).join(' ');
      const urlRefs=[...styles.matchAll(/url\(\s*([^)]*)\)/gi)].map(m=>m[1].trim().replace(/^["']|["']$/g,''));
      if(/@import|@font-face/i.test(styles)||urlRefs.some(ref=>!ref.startsWith('#')))throw new Error('This SVG uses external styles or images. Export a standalone SVG first.');
      blob=new Blob([new XMLSerializer().serializeToString(doc)],{type:'image/svg+xml'});
    }
    url=URL.createObjectURL(blob);
    const img=new Image();img.src=url;await img.decode();
    const nw=img.naturalWidth,nh=img.naturalHeight;
    if(!nw||!nh)throw new Error('The image has no readable dimensions.');
    if(nw*nh>64000000)throw new Error('This image is very large. Export it below 64 megapixels and try again.');
    const measured=await measureImage(img), refs=await references();
    if(!measured.metrics)throw new Error('No visible artwork found. Please upload a logo with visible artwork.');
    const item={source:{...measured,nw,nh,svg,svgText:svg?await blob.text():null,filename:file.name,name:safeName(file.name),isSample,refs}};
    item.outputs=makeOutputs(item.source);
    delete item.source.canvas;
    return item;
  }finally{if(url)URL.revokeObjectURL(url);}
}

function drawLogo(canvas,art,bounds,dimension,offset={x:0,y:0}){
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(art,bounds.x,bounds.y,bounds.width,bounds.height,(canvas.width-dimension.width)/2+offset.x,(canvas.height-dimension.height)/2+offset.y,dimension.width,dimension.height);
}
function makeOutputs(input){
    const art=input.canvas, bounds=input.metrics.bounds;
    const sizes=decideSize(input.metrics,input.refs);
    const portfolio=document.createElement('canvas');portfolio.width=Math.max(1,Math.ceil(sizes.portfolio.width-1e-6));portfolio.height=Math.max(1,Math.ceil(sizes.portfolio.height-1e-6));
    drawLogo(portfolio,art,bounds,sizes.portfolio);
    const spotlight=document.createElement('canvas');spotlight.width=SPOTLIGHT.width;spotlight.height=SPOTLIGHT.height;drawLogo(spotlight,art,bounds,sizes.spotlight,sizes.spotlightOffset);
    return {portfolio,spotlight,review:sizes.review,sizes};
}
function render(){
  const item=entries[0];
  if(!item)return;
  source=item.source;outputs=item.outputs;
  const title=source.filename.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ');
  $('filename').textContent=source.filename+(source.isSample?' · sample':'');$('file-info').hidden=false;
  $('detail-name').textContent=title;$('spotlight-name').textContent=title.toUpperCase();
  const {portfolio,spotlight,sizes}=outputs;
  const bounds=source.metrics.bounds;
  try{
    const purl=portfolio.toDataURL('image/png'),surl=spotlight.toDataURL('image/png');
    document.querySelectorAll('.portfolio-image').forEach(img=>{img.src=purl;img.hidden=false;});
    $('spotlight-image').src=surl;$('spotlight-image').hidden=false;
    document.documentElement.style.setProperty('--logo-width',portfolio.width);
    document.querySelectorAll('.placeholder').forEach(el=>el.hidden=true);
    $('filemeta').textContent=`${source.nw} × ${source.nh} source · ${Math.round(bounds.width/source.factorX)} × ${Math.round(bounds.height/source.factorY)} artwork`;
    $('portfolio-size').textContent=`${portfolio.width} × ${portfolio.height} ${source.svg?'SVG':'PNG'}`;
    const nativeW=bounds.width/source.factorX,nativeH=bounds.height/source.factorY;
    const low=!source.svg&&(nativeW<sizes.spotlight.width*.95||nativeH<sizes.spotlight.height*.95);
    $('decision').textContent=sizes.review?'Studio review needed':'Proportions selected automatically';
    $('match-detail').textContent=sizes.recognized?`Matched to the existing ${sizes.recognized} logo.`:`Compared with ${sizes.matched.map(r=>r.name).join(', ')} for shape and visual weight.`;
    say(sizes.review?`${sizes.reasons.join(' ')} Send the original to your BeeGlobal contact for review; no file has been submitted.`:low?'Sized automatically. The source may look soft in Spotlight; a larger original will give sharper results.':'Sized automatically for all three sections. Your CMS files are ready.');
    status.classList.toggle('review',sizes.review);
    ready(!sizes.review);

  }catch(error){emptyPreview();say(error.message,true);}
}

async function pngBytes(canvas){return new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).arrayBuffer());}
function svgBlob(input,result,kind){
  const ns='http://www.w3.org/2000/svg',doc=new DOMParser().parseFromString(input.svgText,'image/svg+xml');
  const original=doc.documentElement,outer=doc.createElementNS(ns,'svg');
  const canvas=result[kind],size=kind==='portfolio'?result.sizes.portfolio:result.sizes.spotlight;
  const offset=kind==='spotlight'?result.sizes.spotlightOffset:{x:0,y:0};
  const bounds=input.metrics.bounds;
  const cropX=bounds.x/input.factorX,cropY=bounds.y/input.factorY;
  const cropW=bounds.width/input.factorX,cropH=bounds.height/input.factorY;
  const scaleX=size.width/cropW,scaleY=size.height/cropH;
  outer.setAttribute('xmlns',ns);
  outer.setAttribute('width',canvas.width);
  outer.setAttribute('height',canvas.height);
  outer.setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);
  if(!original.hasAttribute('viewBox'))original.setAttribute('viewBox',`0 0 ${input.nw} ${input.nh}`);
  original.setAttribute('x',String((canvas.width-size.width)/2+offset.x-cropX*scaleX));
  original.setAttribute('y',String((canvas.height-size.height)/2+offset.y-cropY*scaleY));
  original.setAttribute('width',String(input.nw*scaleX));
  original.setAttribute('height',String(input.nh*scaleY));
  outer.append(original);
  return new Blob([new XMLSerializer().serializeToString(outer)],{type:'image/svg+xml'});
}
async function exportFile(input,result,kind){
  const outputKind=kind==='spotlight'?'spotlight':'portfolio';
  if(input.svg){const blob=svgBlob(input,result,outputKind);return {extension:'svg',blob,bytes:new Uint8Array(await blob.arrayBuffer())};}
  const bytes=await pngBytes(result[outputKind]);
  return {extension:'png',blob:new Blob([bytes],{type:'image/png'}),bytes};
}
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function download(kind){
  if(!outputs||!source||outputs.review)return;
  const snapshot=outputs,input=source,stem=source.name;
  try{
    if(kind==='all'){
      const files=await Promise.all(['homepage','spotlight','details'].map(async section=>{
        const file=await exportFile(input,snapshot,section);
        return {name:`${stem}-${section}.${file.extension}`,bytes:file.bytes};
      }));
      save(makeZip(files),`${stem}-beeglobal.zip`);
    }else{const file=await exportFile(input,snapshot,kind);save(file.blob,`${stem}-${kind}.${file.extension}`);}
  }catch{say('The download could not be prepared. Please try again.',true);}
}
function updateBatchUI(failures=[],bulk=false){
  $('batch-demo').hidden=!bulk;
  document.querySelectorAll('.single-preview').forEach(section=>section.hidden=bulk);
  $('download-batch').hidden=!bulk;
  const hasReady=entries.some(item=>!item.outputs.review);
  $('download-batch').disabled=!hasReady;
  for(const kind of ['homepage','spotlight','details'])$(`download-batch-${kind}`).disabled=!hasReady;
  $('download-all').hidden=bulk;
  document.querySelector('.individual-downloads:not(.bulk-downloads)').hidden=bulk;
  document.querySelector('.bulk-downloads').hidden=!bulk;
  for(const id of ['bulk-home-grid','bulk-spotlight-grid','bulk-detail-grid'])$(id).replaceChildren();
  if(!bulk)return;
  const readyCount=entries.filter(item=>!item.outputs.review).length;
  const reviewCount=entries.length-readyCount;
  $('file-info').hidden=false;
  $('filename').textContent=`${entries.length} logo${entries.length===1?'':'s'} processed`;
  $('filemeta').textContent=`${readyCount} ready${reviewCount?` · ${reviewCount} for studio review`:''}${failures.length?` · ${failures.length} skipped`:''}`;
  $('decision').textContent=`${readyCount} ready for your CMS`;
  $('match-detail').textContent=reviewCount?`${reviewCount} logo${reviewCount===1?' needs':'s need'} studio review before download.`:'All logos were sized automatically.';
  $('batch-count').textContent=`${entries.length} processed${failures.length?` · ${failures.length} skipped`:''}`;
  const home=document.createDocumentFragment(),spotlight=document.createDocumentFragment(),detail=document.createDocumentFragment();
  entries.forEach(({source:input,outputs:result})=>{
    const name=input.filename.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ');
    const portfolioUrl=result.portfolio.toDataURL('image/png'),spotlightUrl=result.spotlight.toDataURL('image/png');
    const homeItem=document.createElement('div');homeItem.className='bulk-item';
    const homeCard=document.createElement('div');homeCard.className='bulk-home-card';
    const homeLogo=new Image();homeLogo.src=portfolioUrl;homeLogo.alt=`${name} homepage logo`;homeLogo.style.width=`${result.portfolio.width/280*100}%`;homeCard.append(homeLogo);
    homeItem.append(homeCard,bulkCaption(name,result.review));home.append(homeItem);
    const spotItem=document.createElement('div');spotItem.className='bulk-item';
    const spotFrame=document.createElement('div');spotFrame.className='bulk-spotlight-frame';
    const spotWhite=document.createElement('div');spotWhite.className='bulk-spotlight-white';
    const spotLogo=new Image();spotLogo.src=spotlightUrl;spotLogo.alt=`${name} Spotlight logo`;spotWhite.append(spotLogo);spotFrame.append(spotWhite);
    spotItem.append(spotFrame,bulkCaption(name,result.review));spotlight.append(spotItem);
    const detailRow=document.createElement('div');detailRow.className='detail-scene bulk-detail-row';
    const detailHeader=document.createElement('div');detailHeader.className='detail-header';
    const detailTitle=document.createElement('span');detailTitle.textContent=name;
    const closeMark=document.createElement('span');closeMark.textContent='×';closeMark.setAttribute('aria-hidden','true');
    detailHeader.append(detailTitle,closeMark);
    const detailContent=document.createElement('div');detailContent.className='detail-content';
    const detailMain=document.createElement('div');detailMain.className='bulk-detail-main';
    const detailLogoFrame=document.createElement('div');detailLogoFrame.className='detail-logo';
    const detailLogo=new Image();detailLogo.src=portfolioUrl;detailLogo.alt=`${name} company detail logo`;detailLogo.style.width=`${result.portfolio.width*1.1034}px`;
    detailLogoFrame.append(detailLogo);
    const detailText=document.createElement('p');detailText.className='detail-text';detailText.textContent='Company description from the BeeGlobal portfolio will appear here.';
    const detailFacts=document.createElement('div');detailFacts.className='detail-facts';
    for(const [label,value] of [['FOUNDERS','Your team'],['LOCATION','Your city'],['FOUNDING YEAR','Your year']]){
      const fact=document.createElement('span'),answer=document.createElement('b');
      fact.append(label,document.createElement('br'));answer.textContent=value;fact.append(answer);detailFacts.append(fact);
    }
    detailMain.append(detailLogoFrame,detailText,detailFacts);
    const detailAside=document.createElement('div');detailAside.className='bulk-detail-aside';
    const state=document.createElement('span');state.className=result.review?'needs-review':'';state.textContent=result.review?'Studio review':'Ready';detailAside.append(state);
    detailContent.append(detailMain,detailAside);detailRow.append(detailHeader,detailContent);detail.append(detailRow);
  });
  $('bulk-home-grid').append(home);$('bulk-spotlight-grid').append(spotlight);$('bulk-detail-grid').append(detail);
  $('batch-errors').hidden=!failures.length;
  $('batch-errors').textContent=failures.map(({name,error})=>`${name}: ${error}`).join(' · ');
}
function bulkCaption(name,review){
  const caption=document.createElement('div');caption.className='bulk-caption';
  const label=document.createElement('span');label.textContent=name;
  const state=document.createElement('small');state.textContent=review?'Studio review':'Ready';state.className=review?'needs-review':'';
  caption.append(label,state);return caption;
}
async function loadFiles(files,isSample=false){
  const batch=Array.from(files||[]);if(!batch.length)return;
  const ticket=++generation;
  entries=[];source=null;outputs=null;ready(false);emptyPreview();
  updateBatchUI();
  $('decision').textContent='Waiting for a logo';$('match-detail').textContent='We compare the artwork with 22 existing BeeGlobal logos.';
  $('file-info').hidden=true;$('batch-demo').hidden=true;$('download-batch').hidden=true;
  say(`Processing ${batch.length} logo${batch.length===1?'':'s'}…`);
  if(batch.length>30){say('Choose up to 30 logos at a time.',true);return;}
  const failures=[];
  for(let i=0;i<batch.length;i++){
    if(ticket!==generation)return;
    say(`Processing logo ${i+1} of ${batch.length}…`);
    try{const item=await processLogo(batch[i],isSample);if(ticket!==generation)return;entries.push(item);}
    catch(error){if(ticket!==generation)return;failures.push({name:batch[i].name,error:error.message||'Could not read this file'});}
  }
  const bulk=batch.length>1;
  if(!entries.length){say(failures.length===1?failures[0].error:'No logos could be processed. Check the skipped files and try again.',true);updateBatchUI(failures,bulk);return;}
  if(!bulk)render();
  updateBatchUI(failures,bulk);
  if(bulk){
    const readyCount=entries.filter(item=>!item.outputs.review).length;
    say(`${entries.length} processed · ${readyCount} ready to download${failures.length?` · ${failures.length} skipped`:''}. All processed logos appear together in the previews.`);
  }
}
async function downloadBatch(kind='all'){
  const readyItems=entries.map((item,index)=>({item,index})).filter(({item})=>!item.outputs.review);
  if(!readyItems.length)return;
  const button=$(kind==='all'?'download-batch':`download-batch-${kind}`);button.disabled=true;
  try{
    const files=[];
    for(const {item,index} of readyItems){
      const stem=`${String(index+1).padStart(2,'0')}-${item.source.name}`;
      for(const section of kind==='all'?['homepage','spotlight','details']:[kind]){
        const file=await exportFile(item.source,item.outputs,section);
        files.push({name:`${stem}-${section}.${file.extension}`,bytes:file.bytes});
      }
    }
    save(makeZip(files),kind==='all'?'beeglobal-logos.zip':`beeglobal-${kind}-logos.zip`);
  }catch{say('The bulk download could not be prepared. Please try again.',true);}
  finally{button.disabled=false;}
}
fileInput.addEventListener('change',()=>{const files=Array.from(fileInput.files);fileInput.value='';loadFiles(files);});
const dropzone=$('dropzone');
dropzone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click();}});
for(const name of ['dragenter','dragover'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.add('dragging');});
for(const name of ['dragleave','drop'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.remove('dragging');});
dropzone.addEventListener('drop',e=>loadFiles(e.dataTransfer.files));
$('sample').addEventListener('click',async()=>{
  try{const response=await fetch('./assets/whizzo.png');if(!response.ok)throw new Error();await loadFiles([new File([await response.blob()],'Whizzo.png',{type:'image/png'})],true);}catch{say('The sample could not be loaded.',true);}
});
$('clear').addEventListener('click',()=>{generation++;entries=[];source=null;outputs=null;fileInput.value='';$('file-info').hidden=true;updateBatchUI();$('decision').textContent='Waiting for a logo';$('match-detail').textContent='We compare the artwork with 22 existing BeeGlobal logos.';ready(false);emptyPreview();$('detail-name').textContent='Your company';$('spotlight-name').textContent='YOUR COMPANY';$('portfolio-size').textContent='280 × 192 card';say('Transparent logos work best.');});
for(const kind of ['all','homepage','spotlight','details'])$(`download-${kind}`).addEventListener('click',()=>download(kind));
$('download-batch').addEventListener('click',()=>downloadBatch());
for(const kind of ['homepage','spotlight','details'])$(`download-batch-${kind}`).addEventListener('click',()=>downloadBatch(kind));
