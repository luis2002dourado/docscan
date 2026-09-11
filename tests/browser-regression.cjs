const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const root=path.resolve(__dirname,'..'),fixtures=path.join(__dirname,'fixtures'),out=path.join(root,'test-results');
(async()=>{
 const server=spawn('node',['server.js'],{cwd:root,env:{...process.env,PORT:'8877'},stdio:'pipe'});
 let browser;
 try {
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu'],headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await context.route('https://**',route=>route.abort());
  await context.route('**/legacy-vision.js',r=>r.fulfill({path:path.join(__dirname,'legacy-vision.mjs'),contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:8877/docscan/');
  const photographs=[];
  for(const file of fs.readdirSync(fixtures).filter(n=>n.endsWith('.normalized.png'))) {
    const input='data:image/png;base64,'+fs.readFileSync(path.join(fixtures,file)).toString('base64');
    const result=await page.evaluate(async input=>{
      const vision=await import('./vision.js'),legacy=await import('./legacy-vision.js');const img=new Image();img.src=input;await img.decode();
      let beats=0;const timer=setInterval(()=>beats++,10),t=performance.now();
      const c=await vision.processPhoto(img,'auto','original');clearInterval(timer);const elapsed=performance.now()-t;
      const old=await legacy.processPhoto(img,'auto','original');
      const annotated=document.createElement('canvas');annotated.width=img.width;annotated.height=img.height;const x=annotated.getContext('2d');x.drawImage(img,0,0);
      if(c.scanInfo.quad){x.strokeStyle='#00ff55';x.lineWidth=5;x.beginPath();c.scanInfo.quad.forEach((p,i)=>x[i?'lineTo':'moveTo'](p.x*(img.width-1),p.y*(img.height-1)));x.closePath();x.stroke();}
      return {info:c.scanInfo,ms:Math.round(elapsed),beats,width:c.width,height:c.height,corrected:c.toDataURL(),legacy:old.toDataURL(),annotated:annotated.toDataURL()};
    },input);
    for(const kind of ['corrected','annotated','legacy']){fs.writeFileSync(path.join(out,file+'-'+kind+'.png'),Buffer.from(result[kind].split(',')[1],'base64'));delete result[kind];}
    assert.ok(result.info.quad?.length===4,`${file}: sheet not detected`);
    assert.ok(result.beats>0,`${file}: UI heartbeat stopped`);
    photographs.push({file,...result});console.log(file,result.info.status,result.width,result.height);
  }
  // The worker must preserve every pixel when only an internal frame is visible.
  const uncertainInput='data:image/png;base64,'+fs.readFileSync(path.join(fixtures,'moldura_sem_borda.png')).toString('base64');
  await page.evaluate(async input=>{
    const vision=await import('./vision.js'),img=new Image();img.src=input;await img.decode();
    const original=await vision.processPhoto(img,'none','original'),result=await vision.processPhoto(img,'auto','original');
    if(result.scanInfo.status==='detected'||original.toDataURL()!==result.toDataURL())throw new Error('Uncertain crop removed pixels');
  },uncertainInput);
  // Real UI: upload, crop in worker, export, inspect generated PDF.
  await page.locator('#scan-files').setInputFiles(path.join(fixtures,'trapezio.png'));
  await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  await page.locator('#scan-apply').click();
  await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  assert.match(await page.locator('.crop-status').innerText(),/Perspectiva corrigida/);console.log('UI crop passed',await page.evaluate(()=>!!window.PDFLib));
  await page.locator('#scan-export').click();await page.locator('#pdf-name').fill('perspectiva-validada');
  const downloadPromise=page.waitForEvent('download');await page.locator('#name-ok').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'perspectiva-validada.pdf');await download.saveAs(path.join(out,'perspectiva-validada.pdf'));
  const pdf=await PDFDocument.load(fs.readFileSync(path.join(out,'perspectiva-validada.pdf')));assert.equal(pdf.getPageCount(),1);
  assert.ok(pdf.getPage(0).getWidth()<800);
  // Mobile-sized viewport: manual adjustment with actual pointer events.
  await page.setViewportSize({width:390,height:844});await page.locator('[data-corners="0"]').click();
  for(const viewport of [{width:320,height:568},{width:390,height:664},{width:844,height:390},{width:1280,height:600}]) {
    await page.setViewportSize(viewport);await page.waitForTimeout(100);
    for(const selector of ['#corner-canvas','#corner-save','#corner-cancel','#corner-auto']) {
      const bounds=await page.locator(selector).boundingBox();
      assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,selector+' outside '+JSON.stringify(viewport));
    }
  }
  await page.setViewportSize({width:390,height:664});await page.waitForTimeout(100);
  await page.screenshot({path:path.join(out,'manual-viewport.png')});
  const box=await page.locator('#corner-canvas').boundingBox();
  const first={x:280/799,y:100/719};
  await page.mouse.move(box.x+first.x*box.width,box.y+first.y*box.height);await page.mouse.down();await page.mouse.move(box.x+first.x*box.width+3,box.y+first.y*box.height+3);await page.mouse.up();
  await page.locator('#corner-save').click();await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  assert.match(await page.locator('.crop-status').innerText(),/manualmente/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#toast').waitFor({state:'hidden'});
  await page.screenshot({animations:'disabled',path:path.join(out,'mobile.png'),fullPage:true});
  // No-sheet fallback must tell the truth; printing an unprocessed queue must not throw.
  await page.locator('#scan-clear').click();await page.locator('#scan-files').setInputFiles(path.join(fixtures,'sem_documento.png'));
  await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));await page.locator('#scan-print').click();
  await page.locator('#scan-apply').click();await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  assert.match(await page.locator('.crop-status').innerText(),/não identificada/);
  // PDF editor retains the chosen filename.
  await page.locator('[data-tab="edit"]').click();await page.locator('#edit-file').setInputFiles(path.join(out,'perspectiva-validada.pdf'));
  await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));await page.locator('[data-rot="0"]').click();
  await page.locator('#edit-export').click();await page.locator('#pdf-name').fill('editado-nome-correto');
  const editedPromise=page.waitForEvent('download');await page.locator('#name-ok').click();const edited=await editedPromise;assert.equal(edited.suggestedFilename(),'editado-nome-correto.pdf');
  // Original camera JPEG (EXIF orientation + large dimensions), not just thumbnails.
  await page.locator('[data-tab="scan"]').click();await page.locator('#scan-clear').click();
  await page.locator('#scan-files').setInputFiles(path.join(fixtures,'test6.JPG'));
  await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  await page.locator('#scan-apply').click();await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  assert.equal(await page.locator('#scan-grid canvas').count(),1);
  // Warm-installed application must crop and export without a network connection.
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await context.setOffline(true);await page.reload();
  await page.locator('#scan-files').setInputFiles(path.join(fixtures,'trapezio.png'));
  await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  await page.locator('#scan-apply').click();await page.waitForFunction(()=>document.querySelector('#fx').classList.contains('hide'));
  assert.match(await page.locator('.crop-status').innerText(),/Perspectiva corrigida/);
  await page.locator('#scan-export').click();const offlinePromise=page.waitForEvent('download');await page.locator('#name-ok').click();await offlinePromise;
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(requests.filter(r=>r.method!=='GET').length,0);
  fs.writeFileSync(path.join(out,'browser-regression.json'),JSON.stringify({browser:browser.version(),photographs,ui:{upload:true,crop:true,exportPdf:true,manualPointer:true,mobileLayout:true,noSheetWarning:true,editFilename:true,originalCameraJpeg:true,offlineCropAndExport:true},errors,documentUploadRequests:0},null,2));
  console.log('UI regression passed');
 } finally {await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
