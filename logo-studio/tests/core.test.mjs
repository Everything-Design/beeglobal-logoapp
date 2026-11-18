import test from 'node:test';
import { measureVisual, visibleBounds, decideSize } from '../dist/optical.mjs';
import assert from 'node:assert/strict';
import { artworkBounds,fit,safeName,crc32,makeZip } from '../dist/core.mjs';

test('artwork bounds preserve detached marks and low-alpha edge pixels',()=>{
  const p=new Uint8ClampedArray(10*8*4);
  p[(2*10+3)*4+3]=255;p[(6*10+8)*4+3]=1;
  assert.deepEqual({...artworkBounds(p,10,8),coverage:0},{x:3,y:2,width:6,height:5,coverage:0});
  assert.equal(artworkBounds(new Uint8ClampedArray(16),2,2),null);
});
function mark(width,height,filled){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(filled(x,y))data[(y*width+x)*4+3]=255;
  return measureVisual(data,width,height);
}
const dense=mark(120,30,()=>true), thin=mark(120,30,(x,y)=>y<3||y>=27||x<3||x>=117);
const refs=[{name:'Reference',src:'ref.svg',metrics:dense,visibleWidth:120,visibleHeight:30}];
test('equal aspect ratios get different sizes when visual density differs',()=>{
  const a=decideSize(dense,refs),b=decideSize(thin,refs);
  assert.equal(a.recognized,'Reference');assert.equal(b.recognized,null);
  assert.ok(b.portfolio.width>a.portfolio.width);
  assert.ok(b.portfolio.width<=120*1.15+1e-6,'sparse artwork should not become much wider than a comparable reference');
});
test('new artwork cannot grow far beyond nearby reference dimensions',()=>{
  const sparse=mark(120,30,(x,y)=>x===0||y===0);
  const size=decideSize(sparse,refs);
  assert.ok(size.portfolio.width<=120*1.15+1e-6);
  assert.ok(size.portfolio.height<=30*1.3+1e-6);
  assert.ok(Math.abs(size.portfolio.width/size.portfolio.height-4)<1e-6);
  const ordinary=mark(120,30,(x,y)=>x%4===0);
  assert.equal(decideSize(ordinary,[{...refs[0],metrics:ordinary}]).portfolio.width,120,'ordinary recognized artwork retains its existing size');
});
test('very wide, lightly covered marks shrink while dense marks have a mass limit',()=>{
  const wide=mark(440,50,(x,y)=>x%8===0&&y>4&&y<45);
  const peers=[{...refs[0],visibleWidth:200,visibleHeight:25,metrics:{...dense,ratio:8,coverage:.3,density:.3}}];
  const result=decideSize(wide,peers);
  assert.ok(result.portfolio.width<180);
  const heavy=decideSize(dense,refs);
  assert.ok(heavy.portfolio.width<120);
  assert.ok(heavy.portfolio.width*heavy.portfolio.height*dense.density<=1150.001);
});
test('wide, square and tall artwork stays proportional inside both profiles',()=>{
  for(const ratio of [.08,.5,1,2,4,10,35]){
    const s=decideSize({...thin,ratio},refs);
    assert.ok(s.portfolio.width<=206.000001&&s.portfolio.height<=57.000001);
    assert.ok(s.spotlight.width<=240.000001&&s.spotlight.height<=76.000001);
    assert.ok(Math.abs(s.portfolio.width/s.portfolio.height-ratio)<1e-6);
    assert.ok(Math.abs(s.spotlight.width/s.spotlight.height-ratio)<1e-6);
  }
});
test('low contrast, unsupported shapes and unreliable neighborhoods require studio review',()=>{
  assert.ok(decideSize({...thin,contrast:.01},refs).review);
  assert.ok(decideSize({...thin,ratio:.1},refs).review);
  assert.ok(decideSize(thin,refs.map(r=>({...r,validationError:.3}))).review);
});
test('opaque white margins can be cropped without mutating white brand pixels',()=>{
  const data=new Uint8ClampedArray(10*10*4).fill(255);
  for(let y=2;y<8;y++)for(let x=2;x<8;x++){const i=(y*10+x)*4;data[i]=data[i+1]=data[i+2]=0;}
  const middle=(5*10+5)*4;data[middle]=data[middle+1]=data[middle+2]=255;
  const before=data.slice();assert.deepEqual(visibleBounds(data,10,10),{x:2,y:2,width:6,height:6,whiteMargin:true});assert.deepEqual(data,before);
});
test('invalid dimensions fail and filenames remain portable',()=>{
  assert.throws(()=>fit(0,20,200,60));
  assert.equal(safeName('../../Example Logo.svg'),'example-logo');assert.equal(safeName('🤍.png'),'logo');
});
test('ZIP CRC and file headers describe the original bytes',async()=>{
  const bytes=new TextEncoder().encode('123456789');assert.equal(crc32(bytes),0xcbf43926);
  const zip=await makeZip([{name:'logo.png',bytes}]).arrayBuffer();const d=new DataView(zip);
  assert.equal(d.getUint32(0,true),0x04034b50);assert.equal(d.getUint32(14,true),0xcbf43926);
  assert.equal(d.getUint32(zip.byteLength-22,true),0x06054b50);
  assert.equal(d.getUint16(zip.byteLength-14,true),1);
});
