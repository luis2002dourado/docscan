// npm run test:images. Exercises the actual bundled OpenCV engine with pixel data.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),fixtures=path.join(__dirname,'fixtures'),output=path.join(root,'test-results');
(async()=>{
  await import('../public/scanner-core.js');
  const {cv}=await new Promise(resolve=>{const c=require('../public/vendor/opencv-4.10.0.js');c.then(cv=>resolve({cv}));});
  const engine=globalThis.DocScanEngine,legacy=await import('./legacy-vision.mjs');
  const cases=JSON.parse(fs.readFileSync(path.join(fixtures,'ground-truth.json')));let failures=0;const results=[];
  for(const test of cases) {
    const image=PNG.sync.read(fs.readFileSync(path.join(fixtures,test.file)));
    const src=cv.matFromImageData({width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)});
    const t=performance.now(),result=engine.detect(cv,src),elapsed=performance.now()-t;
    const old=legacy.detectDocumentQuad({data:image.data},image.width,image.height);
    function error(q) {if(!q||!test.quad)return null;return Math.max(...test.quad.map(p=>Math.min(...q.map(v=>Math.hypot(p.x-v.x,p.y-v.y)))));}
    const maxError=error(result.quad),oldError=error(old);
    const pass=test.quad?result.status==='detected'&&maxError<14:result.status==='not-found';
    if(!pass)failures++;
    if(result.quad){const r=engine.rectify(cv,src,result.quad);const markers=[0,0,0,0];
      for(let pixel=0;pixel<r.data.length;pixel+=4){const [red,green,blue]=r.data.subarray(pixel,pixel+3);
        if(red>90&&red>green*2.5&&red>blue*2.5)markers[0]++;
        if(green>50&&green>red*2.5&&green>blue*2.5)markers[1]++;
        if(blue>90&&blue>red*2.5&&blue>green*2.5)markers[2]++;
        if(red>90&&blue>90&&red>green*2.5&&blue>green*2.5)markers[3]++;
      }
      assert.ok(markers.every(n=>n>=3),`${test.name}: missing a coloured corner after rectification`);
      fs.writeFileSync(path.join(output,test.name+'-corrected.png'),PNG.sync.write({width:r.width,height:r.height,data:Buffer.from(r.data)}));}
    src.delete();results.push({name:test.name,status:result.status,maxCornerErrorPx:maxError,legacyMaxCornerErrorPx:oldError,ms:Math.round(elapsed),pass});
    console.log(JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(output,'image-regression.json'),JSON.stringify(results,null,2));
  assert.equal(failures,0,`${failures} image regressions failed`);
})();
