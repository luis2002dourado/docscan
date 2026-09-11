"""Deterministic image fixtures with exact corner ground truth (Pillow, numpy)."""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np,json
from pathlib import Path
root=Path(__file__).parent/'fixtures';root.mkdir(exist_ok=True)
page=Image.new('RGB',(480,650),(247,245,239));d=ImageDraw.Draw(page)
d.text((28,22),'DOCSCAN - TESTE DE PERSPECTIVA',fill=(15,20,30))
for y in range(60,610,24):
 d.text((28,y),'Documento de teste. Linha para verificar alinhamento.',fill=(28,30,35))
 d.line((28,y+15,440,y+15),fill=(160,160,160),width=1)
for box,color in [((20,35,38,53),'red'),((442,35,460,53),'green'),((442,612,460,630),'blue'),((20,612,38,630),'magenta')]:d.rectangle(box,fill=color)
page.save(root/'reference.png')
cases=[('frontal',[(170,70),(630,70),(630,650),(170,650)],'plain'),('trapezio',[(280,100),(550,170),(720,650),(70,570)],'plain'),('perspectiva_forte',[(340,60),(540,290),(740,590),(80,500)],'plain'),('rotacao',[(420,40),(745,310),(390,650),(70,370)],'plain'),('lado',[(100,250),(690,60),(580,650),(180,590)],'plain'),('sombra',[(230,80),(620,190),(710,620),(80,580)],'shadow'),('fundo_textura',[(160,80),(620,180),(700,620),(90,590)],'texture'),('baixo_contraste',[(230,70),(640,180),(700,620),(80,590)],'low'),('desfoque',[(280,100),(550,170),(720,650),(70,570)],'blur'),('paisagem',[(130,200),(690,80),(660,540),(100,600)],'plain')]
cases += [('moldura_interna',[(230,70),(640,180),(700,620),(80,590)],'frame'),('moldura_sem_borda',[(230,70),(640,180),(700,620),(80,590)],'invisible')]
metadata=[]
for name,q,kind in cases:
 w,h=800,720;yy,xx=np.mgrid[:h,:w];bg=np.zeros((h,w,3),dtype=np.uint8)
 if kind=='invisible':bg[:]=(247,245,239)
 elif kind=='frame':bg[:]=(229,227,221)
 elif kind=='low':bg[:]=(210,208,204)
 else:
  bg[:]=(76,55,40)
  if kind=='texture':
   noise=np.random.default_rng(72).normal(0,10,(h,w));v=np.sin(yy/8)*12+noise
   bg=np.clip(bg.astype(float)+v[:,:,None],0,255).astype('uint8')
 image=Image.fromarray(bg)
 src=[(0,0),(479,0),(479,649),(0,649)];A=[];B=[]
 for (x,y),(u,v) in zip(q,src):A.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);B.extend([u,v])
 coeff=np.linalg.solve(A,B)
 paper=page.copy()
 if kind in ['frame','invisible']:
  draw=ImageDraw.Draw(paper);draw.rectangle((65,85,415,565),outline=(10,10,10),width=7)
 if kind=='shadow':
  a=np.asarray(paper).astype(float);shade=np.linspace(.55,1,480);paper=Image.fromarray((a*shade[None,:,None]).astype('uint8'))
 warped=paper.transform((w,h),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)
 mask=Image.new('L',page.size,255).transform((w,h),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)
 image.paste(warped,(0,0),mask)
 if kind=='blur':image=image.filter(ImageFilter.GaussianBlur(1.8))
 image.save(root/(name+'.png'))
 metadata.append({'name':name,'file':name+'.png','quad':[{'x':x,'y':y} for x,y in q], 'reviewOnly':kind=='invisible'})
Image.new('RGB',(800,720),(115,115,115)).save(root/'sem_documento.png')
metadata.append({'name':'sem_documento','file':'sem_documento.png','quad':None})
(root/'ground-truth.json').write_text(json.dumps(metadata,indent=2))
