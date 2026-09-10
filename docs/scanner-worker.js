/* The engine is bundled: images never leave this worker/device. */
importScripts('scanner-core.js');
let ready;
function loadCv() {
  if(!ready)ready=new Promise((resolve,reject)=>{
    try {
      globalThis.Module={onRuntimeInitialized:()=>resolve({cv:globalThis.cv}),onAbort:()=>reject(new Error('Falha ao iniciar o motor de recorte.'))};
      importScripts('vendor/opencv-4.10.0.js');
      if(globalThis.cv?.Mat)resolve({cv:globalThis.cv});
      else if(typeof globalThis.cv?.then==='function')globalThis.cv.then(cv=>resolve({cv}));
    }catch(error){reject(error);}
  });
  return ready;
}
self.onmessage=async({data:message})=>{
  const {id,width,height,buffer,manual}=message;let src;
  try {
    const {cv}=await loadCv();
    src=cv.matFromImageData({width,height,data:new Uint8ClampedArray(buffer)});
    const detection=manual?{status:'manual',quad:manual,confidence:1}:DocScanEngine.detect(cv,src);
    const result=detection.quad?DocScanEngine.rectify(cv,src,detection.quad):{width,height,data:new Uint8ClampedArray(src.data)};
    self.postMessage({id,...detection,width:result.width,height:result.height,buffer:result.data.buffer},[result.data.buffer]);
  }catch(error){self.postMessage({id,error:error?.message||String(error)});}
  finally {if(src)src.delete();}
};
