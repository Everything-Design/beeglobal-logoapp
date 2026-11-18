import { artworkBounds, fit } from './core.mjs';
import { PORTFOLIO, SPOTLIGHT } from './profiles.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const darkness=(r,g,b)=>Math.pow(clamp(1-(.2126*r+.7152*g+.0722*b)/255,0,1),.8);
const WIDE_COVERAGE_FLOOR=.20; // Lowest coverage among the calibrated wide website marks is about .204.
const INK_MASS_LIMIT=1700; // Upper limit for compact marks.
const WIDE_INK_MASS_LIMIT=1150; // Wide marks need less ink to balance beside Telora-sized marks.

// White margin detection crops empty canvas only. It never deletes white brand artwork.
export function visibleBounds(data,width,height){
  const alpha=artworkBounds(data,width,height);if(!alpha)return null;
  let white=0,total=0;
  const check=(x,y)=>{const i=(y*width+x)*4;total++;if(data[i+3]>250&&Math.min(data[i],data[i+1],data[i+2])>=245)white++;};
  for(let x=0;x<width;x++){check(x,0);check(x,height-1);}
  for(let y=1;y<height-1;y++){check(0,y);check(width-1,y);}
  if(white/total<.995)return {...alpha,whiteMargin:false};
  let x1=width,y1=height,x2=-1,y2=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    if(data[i+3]>0&&Math.min(data[i],data[i+1],data[i+2])<249){x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);}
  }
  return x2<0?null:{x:x1,y:y1,width:x2-x1+1,height:y2-y1+1,whiteMargin:true};
}

export function measureVisual(data,width,height){
  const bounds=visibleBounds(data,width,height);if(!bounds)return null;
  const rows=new Float64Array(bounds.height),signature=new Float64Array(32*16);
  let ink=0,alpha=0,cx=0,cy=0;
  for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
    const i=((y+bounds.y)*width+x+bounds.x)*4,a=data[i+3]/255;
    const weight=a*darkness(data[i],data[i+1],data[i+2]);
    ink+=weight;alpha+=a;cx+=weight*(x+.5);cy+=weight*(y+.5);rows[y]+=weight;
    const gx=Math.min(31,Math.floor((x+.5)/bounds.width*32)),gy=Math.min(15,Math.floor((y+.5)/bounds.height*16));
    signature[gy*32+gx]+=weight;
  }
  let cumulative=0,bodyStart=0,bodyEnd=bounds.height;let found=false;
  for(let y=0;y<rows.length;y++){cumulative+=rows[y];if(!found&&cumulative>=ink*.05){bodyStart=y;found=true;}if(cumulative>=ink*.95){bodyEnd=y+1;break;}}
  const norm=Math.sqrt(signature.reduce((s,x)=>s+x*x,0))||1;
  return {bounds,ratio:bounds.width/bounds.height,density:ink/(bounds.width*bounds.height),coverage:alpha/(bounds.width*bounds.height),contrast:ink/(alpha||1),bodyHeight:(bodyEnd-bodyStart)/bounds.height,centroidX:ink?cx/ink/bounds.width:.5,centroidY:ink?cy/ink/bounds.height:.5,signature:Array.from(signature,x=>x/norm)};
}

export function similarity(a,b){return a.signature.reduce((s,v,i)=>s+v*b.signature[i],0);}
function featureDistance(a,b){
  return (Math.log(a.ratio/b.ratio)/.65)**2+(.65*Math.log(Math.max(a.density,.001)/Math.max(b.density,.001))/.7)**2+((a.bodyHeight-b.bodyHeight)/.35)**2;
}
const geometricMean=(items,get)=>Math.exp(items.reduce((s,r)=>s+r.weight*Math.log(Math.max(get(r),1e-8)),0)/items.reduce((s,r)=>s+r.weight,0));

// Select a candidate from geometric footprint AND contrast-weighted visible ink.
// This is deterministic reference matching, not a claim of AI/designer approval.
export function decideSize(metrics,references){
  if(!metrics||!references.length)throw new Error('Logo references are unavailable.');
  const ranked=references.map(r=>({...r,distance:featureDistance(metrics,r.metrics),likeness:similarity(metrics,r.metrics)})).sort((a,b)=>a.distance-b.distance);
  const recognized=ranked.find(r=>Math.abs(Math.log(metrics.ratio/r.metrics.ratio))<.018&&r.likeness>.995);
  const peers=ranked.slice(0,5).map(r=>({...r,weight:Math.exp(-Math.min(r.distance,20)/2)}));
  const targetArea=geometricMean(peers,r=>r.visibleWidth*r.visibleHeight);
  const targetInk=geometricMean(peers,r=>r.visibleWidth*r.visibleHeight*r.metrics.density);
  // Preserve the calibrated footprint/ink blend, but bound excessive growth from sparse ink.
  const rawArea=Math.exp(.6*Math.log(targetArea)+.4*Math.log(targetInk/Math.max(metrics.density,.001)));
  const candidateArea=Math.min(rawArea,targetArea*1.15**2);
  const candidate={width:Math.sqrt(candidateArea*metrics.ratio),height:Math.sqrt(candidateArea/metrics.ratio)};
  const closest=ranked.slice(0,3);
  const peerWidthLimit=Math.max(...closest.map(r=>r.visibleWidth))*1.15;
  const peerHeightLimit=Math.max(...closest.map(r=>r.visibleHeight))*1.3;
  const baseline=recognized?{width:recognized.visibleWidth,height:recognized.visibleWidth/metrics.ratio}:fit(candidate.width,candidate.height,peerWidthLimit,peerHeightLimit);
  // Wide letter spacing consumes width without adding much artwork. Preserve known website marks.
  const spreadScale=!recognized&&metrics.ratio>=6?clamp(metrics.coverage/WIDE_COVERAGE_FLOOR,.72,1):1;
  const basePortfolio=fit(baseline.width,baseline.height,PORTFOLIO.maxWidth,PORTFOLIO.maxHeight);
  const spreadAdjusted={width:basePortfolio.width*spreadScale,height:basePortfolio.height*spreadScale};
  const initialInk=spreadAdjusted.width*spreadAdjusted.height*metrics.density;
  const inkLimit=INK_MASS_LIMIT-(INK_MASS_LIMIT-WIDE_INK_MASS_LIMIT)*clamp(metrics.ratio-3,0,1);
  const inkScale=Math.min(1,Math.sqrt(inkLimit/Math.max(initialInk,1)));
  const sized={width:spreadAdjusted.width*inkScale,height:spreadAdjusted.height*inkScale};
  const portfolio=fit(sized.width,sized.height,PORTFOLIO.maxWidth,PORTFOLIO.maxHeight);
  const spotlight=fit(sized.width,sized.height,SPOTLIGHT.maxWidth,SPOTLIGHT.maxHeight,SPOTLIGHT.multiplier);
  // Sparse wide marks are intentionally smaller, so compare their ink against the adjusted target.
  const massRatio=portfolio.width*portfolio.height*metrics.density/(targetInk*spreadScale**2);
  const reasons=[];
  if(metrics.contrast<.12)reasons.push('The logo has too little contrast against these website backgrounds.');
  if(metrics.ratio<.45||metrics.ratio>14)reasons.push('This unusually tall or wide layout needs a studio check.');
  if(!recognized&&(massRatio<.5||massRatio>2.1))reasons.push('The artwork cannot reach a comparable visual weight inside the website limits.');
  if(!recognized&&inkScale<.85)reasons.push('This dense artwork needs an individual size check.');
  if(!recognized&&ranked[0].distance>7)reasons.push('This artwork differs too much from the reference set for a reliable automatic match.');
  // A new mark near a reference that the model could not reproduce is uncertain too.
  // This guard uses held-out results, not just confidence in the model's own score.
  if(!recognized&&ranked.slice(0,3).some(r=>(r.validationError||0)>.20))reasons.push('Similar reference logos need individual sizing choices, so this result needs a studio check.');
  const matched=(recognized?[recognized,...ranked.filter(r=>r.name!==recognized.name)]:ranked).slice(0,3);
  return {portfolio,spotlight,review:reasons.length>0,reasons,recognized:recognized?.name||null,matched:matched.map(r=>({name:r.name,src:r.src,width:r.visibleWidth,height:r.visibleHeight})),massRatio,targetInk,targetArea,spotlightOffset:{x:clamp((.5-metrics.centroidX)*spotlight.width*.2,-4,4),y:clamp((.5-metrics.centroidY)*spotlight.height*.25,-4,4)}};
}

export async function measureImage(img){
  const factor=Math.min(4,1024/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*factor));canvas.height=Math.max(1,Math.round(img.naturalHeight*factor));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  const metrics=measureVisual(pixels.data,canvas.width,canvas.height);
  return {canvas,metrics,factorX:canvas.width/img.naturalWidth,factorY:canvas.height/img.naturalHeight};
}

export async function calibrateReferences(){
  const response=await fetch('./reference-sources.json');if(!response.ok)throw new Error('Reference manifest missing.');
  const sources=await response.json();
  const references=await Promise.all(sources.map(async source=>{
    const img=new Image();img.src=source.src;await img.decode();
    const {metrics,factorX,factorY}=await measureImage(img);
    if(!metrics||metrics.density<=0)throw new Error(`No reference artwork: ${source.name}`);
    return {...source,metrics,visibleWidth:metrics.bounds.width/factorX,visibleHeight:metrics.bounds.height/factorY,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight};
  }));
  const validation=references.map(r=>{
    const prediction=decideSize(r.metrics,references.filter(other=>other.name!==r.name));
    return Math.abs(prediction.portfolio.width/r.visibleWidth-1);
  });
  return references.map((r,i)=>({...r,validationError:validation[i]}));
}
