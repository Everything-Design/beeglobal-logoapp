export function artworkBounds(data, width, height) {
  let left=width, top=height, right=-1, bottom=-1, ink=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const a=data[(y*width+x)*4+3];
    if(a>0) { left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);ink+=a/255; }
  }
  if(right<0) return null;
  return { x:left,y:top,width:right-left+1,height:bottom-top+1,coverage:ink/((right-left+1)*(bottom-top+1)) };
}

export function fit(width,height,maxWidth,maxHeight,scale=1) {
  if(![width,height,maxWidth,maxHeight,scale].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid logo dimensions');
  const factor=Math.min(scale,maxWidth/width,maxHeight/height);
  return {width:width*factor,height:height*factor};
}

export function safeName(name) {
  return name.replace(/\.[^.]+$/,'').normalize('NFKD').replace(/[^a-zA-Z0-9-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase().slice(0,70)||'logo';
}

// Store-only ZIP keeps downloads dependency-free; PNGs are already compressed.
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export function makeZip(files) {
  const locals=[],central=[];let offset=0,centralSize=0;
  for(const file of files){
    const name=new TextEncoder().encode(file.name), bytes=file.bytes,crc=crc32(bytes);
    const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);
    v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);local.set(name,30);
    locals.push(local,bytes);
    const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);
    d.setUint32(16,crc,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);
    central.push(c);centralSize+=c.length;offset+=local.length+bytes.length;
  }
  const end=new Uint8Array(22),d=new DataView(end.buffer);d.setUint32(0,0x06054b50,true);d.setUint16(8,files.length,true);d.setUint16(10,files.length,true);d.setUint32(12,centralSize,true);d.setUint32(16,offset,true);
  return new Blob([...locals,...central,end],{type:'application/zip'});
}
