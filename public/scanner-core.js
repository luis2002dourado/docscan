/* Shared by the OpenCV worker and geometry tests. No network or document storage. */
(() => {
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const cross = (a,b,c) => (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  function orderQuad(points) {
    if (!points || points.length !== 4) throw new Error('São necessários quatro cantos.');
    const cx=points.reduce((s,p)=>s+p.x,0)/4, cy=points.reduce((s,p)=>s+p.y,0)/4;
    const q=points.map(p=>({x:p.x,y:p.y})).sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
    const first=q.reduce((best,p,i)=>p.x+p.y<q[best].x+q[best].y?i:best,0);
    return q.slice(first).concat(q.slice(0,first));
  }
  function quadArea(q) { return Math.abs(q.reduce((s,p,i)=>{const n=q[(i+1)%4];return s+p.x*n.y-p.y*n.x;},0))/2; }
  function isValidQuad(q,w,h,minArea=0.02) {
    if (!q || q.length!==4 || q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>w-1||p.y>h-1)) return false;
    const signs=q.map((p,i)=>cross(p,q[(i+1)%4],q[(i+2)%4]));
    if (!(signs.every(s=>s>1)||signs.every(s=>s< -1))) return false;
    if (quadArea(q)<w*h*minArea) return false;
    return q.every((p,i)=>dist(p,q[(i+1)%4])>=Math.min(w,h)*0.025);
  }
  function solveHomography(src,dst) {
    const M=[];
    for(let i=0;i<4;i++) { const {x,y}=src[i],{x:u,y:v}=dst[i];M.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]); }
    for(let i=0;i<8;i++) {
      let k=i;for(let j=i+1;j<8;j++)if(Math.abs(M[j][i])>Math.abs(M[k][i]))k=j;
      [M[i],M[k]]=[M[k],M[i]];const d=M[i][i];if(Math.abs(d)<1e-10)throw new Error('Cantos degenerados.');
      for(let j=i;j<=8;j++)M[i][j]/=d;
      for(let r=0;r<8;r++)if(r!==i){const f=M[r][i];for(let j=i;j<=8;j++)M[r][j]-=f*M[i][j];}
    }
    return M.map(row=>row[8]).concat(1);
  }
  const applyHomography=(h,x,y)=>{const z=h[6]*x+h[7]*y+h[8];return {x:(h[0]*x+h[1]*y+h[2])/z,y:(h[3]*x+h[4]*y+h[5])/z};};

  // Every edge must have supporting image gradients. No equal-side or right-angle test.
  function edgeSupport(q,edges,w,h) {
    const support=q.map((a,i)=>{
      const b=q[(i+1)%4];let hits=0;
      for(let t=0;t<48;t++) {
        const u=(t+0.5)/48,x=Math.round(a.x+(b.x-a.x)*u),y=Math.round(a.y+(b.y-a.y)*u);let hit=false;
        for(let dy=-3;dy<=3&&!hit;dy++)for(let dx=-3;dx<=3;dx++){
          const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h&&edges[yy*w+xx]){hit=true;break;}
        }
        if(hit)hits++;
      }
      return hits/48;
    });
    return {mean:support.reduce((s,v)=>s+v,0)/4,min:Math.min(...support)};
  }
  // Printed boxes often have paper on BOTH sides. Compare bands beyond the ink,
  // in RGB, so coloured sheets and backgrounds with equal luminance also work.
  function boundaryContrast(q,rgba,w,h) {
    const step=Math.max(5,Math.min(w,h)*0.012);
    const sides=q.map((a,i)=>{
      const b=q[(i+1)%4],len=dist(a,b),nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
      const values=[];
      for(let t=2;t<22;t++) {
        const x=a.x+(b.x-a.x)*t/24,y=a.y+(b.y-a.y)*t/24;
        const bands=[[],[]];
        for(const offset of [1,1.7,2.5])for(let side=0;side<2;side++) {
          const sign=side? -1:1,xx=Math.round(x+nx*step*offset*sign),yy=Math.round(y+ny*step*offset*sign);
          if(xx>=0&&yy>=0&&xx<w&&yy<h)bands[side].push(Array.from(rgba.subarray((yy*w+xx)*4,(yy*w+xx)*4+3)));
        }
        if(bands.some(v=>v.length<2))continue;
        const med=bands.map(v=>[0,1,2].map(c=>v.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(v.length/2)]));
        values.push(Math.hypot(...med[0].map((v,c)=>v-med[1][c]))/Math.sqrt(3));
      }
      return values.length?values.sort((a,b)=>a-b)[Math.floor(values.length/2)]:0;
    });
    return {sides,credible:sides.filter(v=>v>=9).length,mean:sides.reduce((a,b)=>a+b,0)/4};
  }
  function detect(cv,src) {
    const owned=[];const mat=()=>{const m=new cv.Mat();owned.push(m);return m;};
    try {
      const small=mat(),scale=Math.min(1,960/Math.max(src.cols,src.rows));
      cv.resize(src,small,new cv.Size(Math.round(src.cols*scale),Math.round(src.rows*scale)),0,0,cv.INTER_AREA);
      const w=small.cols,h=small.rows,gray=mat(),smooth=mat(),edges=mat();
      cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,smooth,new cv.Size(5,5),0);
      cv.Canny(smooth,edges,10,35);
      const channel=mat(),channelEdges=mat();
      channel.create(h,w,cv.CV_8UC1);
      for(let channelIndex=0;channelIndex<3;channelIndex++) {
        for(let pixel=0;pixel<w*h;pixel++)channel.data[pixel]=small.data[pixel*4+channelIndex];cv.GaussianBlur(channel,channel,new cv.Size(5,5),0);
        cv.Canny(channel,channelEdges,15,45);cv.bitwise_or(edges,channelEdges,edges);
      }
      const kernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));owned.push(kernel);
      let best=null;let candidates=0;
      const inspect=(binary)=>{
        const contours=new cv.MatVector(),hierarchy=new cv.Mat();
        try {
          cv.findContours(binary,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
          for(let i=0;i<contours.size();i++) {
            const c=contours.get(i),poly=new cv.Mat();
            try {
              const area=Math.abs(cv.contourArea(c));if(area<w*h*0.035)continue;
              const perimeter=cv.arcLength(c,true);
              for(const epsilon of [0.003,0.006,0.009,0.012,0.02,0.03,0.045]) {
                cv.approxPolyDP(c,poly,perimeter*epsilon,true);
                if(poly.rows!==4 || !cv.isContourConvex(poly))continue;
                const q=orderQuad(Array.from({length:4},(_,j)=>({x:poly.data32S[j*2],y:poly.data32S[j*2+1]})));
                if(!isValidQuad(q,w,h,0.035))continue;
                // Exclude the image frame and incomplete sheets touching the frame.
                if(q.some(p=>p.x<2||p.y<2||p.x>w-3||p.y>h-3))continue;
                const a=quadArea(q),fill=area/a;if(fill<0.80||fill>1.20)continue;
                const support=edgeSupport(q,edges.data,w,h);
                const strong=support.min>=0.45&&support.mean>=0.68;
                const review=!strong&&a>w*h*0.25&&fill>0.96&&fill<1.08&&support.mean>=0.60;
                if(!strong&&!review)continue;
                candidates++;
                const boundary=boundaryContrast(q,small.data,w,h);
                const uncertain=review||boundary.credible<3;
                const score=Math.sqrt(a/(w*h))*(0.5+0.5*support.mean)*Math.min(fill,1/fill)*(0.45+0.55*Math.min(1,boundary.mean/24));
                if(!best||score>best.score)best={q,score,support,review:uncertain};
              }
            } finally {poly.delete();c.delete();}
          }
        } finally {contours.delete();hierarchy.delete();}
      };
      const binary=mat();
      cv.morphologyEx(edges,binary,cv.MORPH_CLOSE,kernel);inspect(binary);
      for(const pair of [[25,75],[60,180],[10,35],[3,12]]) {
        cv.Canny(smooth,binary,...pair);cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,kernel);inspect(binary);
      }
      // Threshold segmentation complements edges on shadows and coloured backgrounds.
      cv.threshold(smooth,binary,0,255,cv.THRESH_BINARY|cv.THRESH_OTSU);inspect(binary);
      cv.bitwise_not(binary,binary);inspect(binary);
      for(const threshold of [80,120,160,195,220,235]) {
        cv.threshold(smooth,binary,threshold,255,cv.THRESH_BINARY);inspect(binary);
      }
      return best?{status:best.review?'review':'detected',quad:best.q.map(p=>({x:p.x*(src.cols-1)/(w-1),y:p.y*(src.rows-1)/(h-1)})),confidence:best.support.mean,candidates}:{status:'not-found',quad:null,confidence:0,candidates};
    } finally {owned.reverse().forEach(m=>m.delete());}
  }
  function rectify(cv,src,q) {
    if(!isValidQuad(q,src.cols,src.rows))throw new Error('Posicione os quatro cantos ao redor da folha, sem cruzar as bordas.');
    q=orderQuad(q);
    let width=Math.max(dist(q[0],q[1]),dist(q[3],q[2])),height=Math.max(dist(q[0],q[3]),dist(q[1],q[2]));
    const scale=Math.min(1,2400/Math.max(width,height));width=Math.max(2,Math.round(width*scale));height=Math.max(2,Math.round(height*scale));
    const from=cv.matFromArray(4,1,cv.CV_32FC2,q.flatMap(p=>[p.x,p.y]));
    const to=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,width-1,0,width-1,height-1,0,height-1]);
    let transform,out;
    try {transform=cv.getPerspectiveTransform(from,to);out=new cv.Mat();cv.warpPerspective(src,out,transform,new cv.Size(width,height),cv.INTER_LINEAR,cv.BORDER_REPLICATE);return {width,height,data:new Uint8ClampedArray(out.data)};}
    finally {from.delete();to.delete();if(transform)transform.delete();if(out)out.delete();}
  }
  globalThis.DocScanEngine={orderQuad,quadArea,isValidQuad,dist,solveHomography,applyHomography,detect,rectify};
})();
