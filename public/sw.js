const CACHE='docscan-v23';
const base=new URL('./',self.location.href);
const assets=['./','index.html','styles.css?v=23','app.js?v=23','vision.js','scanner-core.js','scanner-worker.js','vendor/opencv-4.10.0.js','vendor/pdf.min.js','vendor/pdf.worker.min.js','vendor/pdf-lib.min.js','manifest.json','ds-192.png','ds-512.png'].map(p=>new URL(p,base).href);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(assets)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('docscan-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
  event.respondWith(fetch(event.request).then(res=>{
    if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return res;
  }).catch(async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    if(event.request.mode==='navigate')return (await caches.match(new URL('index.html',base).href))||Response.error();
    return Response.error();
  }));
});
