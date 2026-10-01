# Builds the paper-doll hero layers (assets/quest/hero-*.webp) from the raw
# ChatGPT art on the art-raw branch. Usage: python3 tools/quest-doll.py <dir>
# where <dir>/art holds hero-mid.png, eq-helm.png, eq-weapon.png; output goes
# to <dir>/doll. Heads are aligned by eye position, weapons by grip point.
import sys, math, numpy as np
from PIL import Image
SP=sys.argv[1]; OUT=f"{SP}/doll"
base=np.array(Image.open(f"{SP}/art/hero-mid.png").convert("RGBA"))
N=768
# ---------- body: no head (above the neck) and no sword (left of the hand)
NECK=412
body=base.copy()
body[:NECK]=0
body[495:640,:280]=0
# re-outline the cut edge of the glove
for y in range(495,640):
    if body[y,280,3]>0: body[y,279]=[27,27,31,255]
# hand layer: glove and grip, drawn over the weapon
hand=np.zeros_like(base); hand[503:563,279:312]=body[503:563,279:312]
# ---------- heads from the helm sheet, aligned by the eyes
BASE_EYES=((317.4,359.4),(395.0,353.3))
sheet=np.array(Image.open(f"{SP}/art/eq-helm.png").convert("RGBA"))
EYES={"kettle":((150.5,285.9),(214.2,282.3)),"horned":((497.3,291.7),(558.6,288.3)),
      "hood":((152.7,608.8),(216.0,605.1)),"circlet":((502.9,615.4),(564.3,611.0))}
QUAD={"kettle":(0,0),"horned":(384,0),"hood":(0,384),"circlet":(384,384)}
def place(src_rgba, src_pts, dst_pts):
    (a1,a2),(b1,b2)=src_pts,dst_pts
    sv=np.subtract(a2,a1); dv=np.subtract(b2,b1)
    s=np.hypot(*dv)/np.hypot(*sv); ang=math.atan2(dv[1],dv[0])-math.atan2(sv[1],sv[0])
    c,si=math.cos(ang)*s, math.sin(ang)*s
    # forward: dst = M*src + t ; we need inverse for PIL
    M=np.array([[c,-si],[si,c]]); sm=np.mean([a1,a2],axis=0); dm=np.mean([b1,b2],axis=0); t=dm-M@sm
    Mi=np.linalg.inv(M); ti=-Mi@t
    im=Image.fromarray(src_rgba)
    return np.array(im.transform((N,N),Image.AFFINE,(Mi[0,0],Mi[0,1],ti[0],Mi[1,0],Mi[1,1],ti[1]),resample=Image.BICUBIC))
heads={}
for n,(qx,qy) in QUAD.items():
    q=sheet.copy(); keep=np.zeros(q.shape[:2],bool); keep[qy:qy+384,qx:qx+384]=True; q[~keep]=0
    h=place(q,EYES[n],BASE_EYES)
    h[NECK+14:]=0           # keep a little scarf overlap, drop the shoulders
    h[:,:,3]=np.where(h[:,:,3]>110,255,0)
    heads[n]=h
# ---------- weapons from the icon sheet, put in the hand
wsheet=np.array(Image.open(f"{SP}/art/eq-weapon.png").convert("RGBA"))
GRIP=(285.0,529.0)
WEAP={ # grip fraction along handle->tip, length on hero, angle (deg, screen coords)
 "sword":(0.13,215,153),"axe":(0.2,175,-118),"bow":(0.50,230,100),"staff":(0.30,260,-124)}
WQ={"sword":(0,0),"axe":(384,0),"bow":(0,384),"staff":(384,384)}
weapons={}
for n,(qx,qy) in WQ.items():
    q=wsheet[qy:qy+384,qx:qx+384].copy()
    ys,xs=np.nonzero(q[:,:,3]>40)
    proj=(xs-ys)                       # along the (1,-1) diagonal
    hi=np.argmax(proj); lo=np.argmin(proj)
    tail=np.array([xs[lo],ys[lo]],float); tip=np.array([xs[hi],ys[hi]],float)
    g,L,deg=WEAP[n]
    gp=tail+(tip-tail)*g
    d=np.array([math.cos(math.radians(deg)),math.sin(math.radians(deg))])
    full=np.zeros((N,N,4),np.uint8); full[qy:qy+384,qx:qx+384]=q
    src=(gp+[qx,qy], tip+[qx,qy])
    dst=(np.array(GRIP), np.array(GRIP)+d*L*(1-g))
    w=place(full,src,dst); w[:,:,3]=np.where(w[:,:,3]>110,255,0)
    weapons[n]=w
layers={"body":body,"hand":hand}
layers.update({"head-"+k:v for k,v in heads.items()}); layers.update({"wpn-"+k:v for k,v in weapons.items()})
# common crop box so every layer stacks exactly
ys,xs=np.nonzero(np.max([l[:,:,3] for l in layers.values()],axis=0)>0)
box=(xs.min()-4,ys.min()-4,xs.max()+5,ys.max()+5); print("box",box)
W=box[2]-box[0]; H=box[3]-box[1]; k=400/max(W,H)
for n,l in layers.items():
    im=Image.fromarray(l).crop(box).resize((round(W*k),round(H*k)),Image.LANCZOS)
    im.save(f"{OUT}/hero-{n}.webp","WEBP",quality=92,method=6)
# preview grid: 4 heads x 4 weapons
cells=[]
order=lambda hn,wn:[f"hero-body",f"hero-wpn-{wn}","hero-hand",f"hero-head-{hn}"]
tw,th=round(W*k),round(H*k)
P=Image.new("RGBA",(tw*4,th*4),(60,62,78,255))
for i,hn in enumerate(["kettle","horned","hood","circlet"]):
    for j,wn in enumerate(["sword","axe","bow","staff"]):
        c=Image.new("RGBA",(tw,th),(0,0,0,0))
        for f in order(hn,wn): c.alpha_composite(Image.open(f"{OUT}/{f}.webp").convert("RGBA"))
        P.alpha_composite(c,(j*tw,i*th))
P.save(f"{OUT}/preview.png"); print(tw,th)
