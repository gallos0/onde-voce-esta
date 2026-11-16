'use strict';
/* =====================================================================
   ONDE VOCÊ ESTÁ? — mundo pintado (WebGL1, leve e estável em celulares)
   ===================================================================== */
const $=id=>document.getElementById(id);
const TAU=Math.PI*2;
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let R=Math.random;
const rnd=(a,b)=>a+R()*(b-a),pick=a=>a[Math.floor(R()*a.length)];
const clamp=(x,a,b)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
function smooth(e0,e1,x){const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t)}
const isTouch=matchMedia('(pointer:coarse)').matches;
const NV=(()=>{const r=rng(9),P=256,v=new Float32Array(P*P);for(let i=0;i<P*P;i++)v[i]=r();return v})();
function noise(x,y,px,py){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),w=yf*yf*(3-2*yf);
  const m=(a,p)=>(((a%p)+p)%p)&255,i0=m(xi,px),i1=m(xi+1,px),j0=m(yi,py),j1=m(yi+1,py);
  const a=NV[j0*256+i0],b=NV[j0*256+i1],c=NV[j1*256+i0],d=NV[j1*256+i1];return a+(b-a)*u+(c-a)*w+(a-b-c+d)*u*w}
function fbm(x,y,px,py,oct){let s=0,a=.5,f=1,n=0;for(let o=0;o<oct;o++){s+=a*noise(x*f,y*f,px*f,py*f);n+=a;a*=.5;f*=2}return s/n}
function mkC(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}

/* ---------------- safety ---------------- */
let fatalShown=false,ctxLost=false;
function fatal(msg){if(fatalShown)return;fatalShown=true;try{for(const id of ['win','intro','map'])$(id).classList.add('hidden');$('fatalMsg').textContent=msg;$('fatal').classList.remove('hidden');const l=$('loading');if(l)l.remove()}catch(e){}}
$('fReload').onclick=()=>location.reload();
$('fLeve').onclick=()=>{save.quality='leve';persist();location.reload()};
addEventListener('error',e=>{console.error(e.error||e.message);fatal('Algo deu errado ao carregar o jogo ('+(e.message||'erro')+'). Toque em "Modo leve" para tentar de novo.')});
addEventListener('unhandledrejection',e=>{console.error(e.reason);fatal('Não consegui carregar uma das pinturas. Verifique a internet e toque em "Recarregar".')});

/* ---------------- save ---------------- */
const SK='ondevoceesta_v4';
const save={level:1,best:0,visits:0,streak:0,sound:true,quality:null,eve:false,seenRegion:0,fallen:false,sons:false,brother:null,ended:false};
try{Object.assign(save,JSON.parse(localStorage.getItem(SK)||'{}'));if(!localStorage.getItem(SK)){const o=JSON.parse(localStorage.getItem('ondevoceesta_v3')||'{}');for(const k of ['level','best','visits','streak','sound','eve'])if(k in o)save[k]=o[k];save.level=Math.min(save.level||1,19)}}catch(e){}
if(!['alta','leve'].includes(save.quality))save.quality=(navigator.deviceMemory&&navigator.deviceMemory<=2)?'leve':'alta';
function persist(){try{localStorage.setItem(SK,JSON.stringify(save))}catch(e){}}
const LIGHT=save.quality==='leve';

/* ---------------- WebGL ---------------- */
const cv=$('cv');
let gl=null;try{gl=cv.getContext('webgl',{antialias:false,alpha:false,premultipliedAlpha:false,powerPreference:'default'})||cv.getContext('experimental-webgl')}catch(e){}
if(!gl){fatal('Este navegador não liberou os gráficos (WebGL). Atualize o navegador ou abra no Chrome / Safari.');throw new Error('nogl')}
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();ctxLost=true;fatal('O celular pausou os gráficos para economizar memória. Toque em "Recarregar": seu progresso está salvo.')},false);
const HP=(()=>{const f=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);return f&&f.precision>0})();
const DPR=Math.min(window.devicePixelRatio||1,LIGHT?1:2);
let CW=innerWidth,CH=innerHeight;
function resize(){CW=innerWidth;CH=innerHeight;cv.width=Math.round(CW*DPR);cv.height=Math.round(CH*DPR);clampView(V)}
addEventListener('resize',()=>{resize()});

const GRADE=`
uniform vec3 uTint,uFogC,uGlowP,uGlowC;uniform float uSat,uFogK,uFogD,uNight,uFall,uFlash,uTime,uDark;uniform vec2 uImg;
float decD(vec4 d){float t=(d.r*65280.0+d.g*255.0)/65535.0;return 0.1*exp(t*11.40756);}
vec3 grade(vec3 c,float D,vec2 ip){
  float l=dot(c,vec3(.299,.587,.114));
  vec3 fc=mix(vec3(l),c,.5)*vec3(.98,.95,.92);c=mix(c,fc,uFall);
  c*=uTint;l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);
  float f=(1.0-exp(-D/uFogD))*uFogK;c=mix(c,uFogC,clamp(f,0.0,1.0));
  c=mix(c,c*vec3(.30,.40,.68)*.8,uNight);
  vec2 dg=(ip-uGlowP.xy)/vec2(1.0,1.3);float g=exp(-dot(dg,dg)/(uGlowP.z*uGlowP.z));
  c=c*(1.0-uDark*(1.0-g*.9))+uGlowC*g;
  return c+uFlash;}
`;
const PREC=`precision ${HP?'highp':'mediump'} float;\n`;
const VS_BG=`attribute vec2 aP;uniform vec3 uView;uniform vec2 uScr,uImg;varying vec2 vUv;
void main(){vec2 s=(aP-uView.xy)*uView.z/uScr;gl_Position=vec4(s.x*2.0-1.0,1.0-s.y*2.0,0.0,1.0);vUv=aP/uImg;}`;
const FS_BG=PREC+GRADE+`uniform sampler2D uBg,uDat,uBg2,uDat2;uniform float uMix,uWind,uVig,uFx;uniform vec2 uScr2,uMixC;varying vec2 vUv;
void main(){vec2 uv=vUv;vec4 d=texture2D(uDat,uv);float cls=d.b*255.0;vec2 px=1.0/uImg;vec2 o=vec2(0.0);
 if(uFx>0.5){if((cls>50.0&&cls<80.0)||(cls>220.0&&cls<240.0)){float ph=uTime*1.6+uv.y*70.0+uv.x*40.0;o=vec2(sin(ph)+.5*sin(ph*2.3+uv.x*90.0),.6*cos(ph*.8))*px*uWind*1.3;}
 else if(cls>110.0&&cls<150.0){o=vec2(sin(uTime*1.3+uv.y*uImg.y*.35+sin(uv.x*uImg.x*.05))*.7,0.0)*px;}}
 vec3 c=texture2D(uBg,uv+o).rgb;float D=decD(d);
 if(cls>110.0&&cls<150.0){vec2 w=uv*uImg;float s=sin(w.x*.21+uTime*1.7+sin(w.y*.13))*sin(w.y*.37-uTime*1.1+sin(w.x*.07)*2.0);c+=vec3(.07,.065,.05)*smoothstep(.93,1.0,s)*(1.0-uNight);}
 if(uMix>0.0){vec4 d2=texture2D(uDat2,uv);vec3 c2=texture2D(uBg2,uv+o).rgb;
   float n=length((uv*uImg-uMixC)/uImg.y)*1.3+.18*sin(uv.x*37.0+sin(uv.y*23.0)*2.0)+.12*sin(uv.y*51.0+uv.x*13.0);
   float m=smoothstep(n-.08,n+.08,uMix*1.9-.15);c=mix(c,c2,m);D=mix(D,decD(d2),m);cls=mix(cls,d2.b*255.0,step(.5,m));}
 if(cls>180.0&&cls<220.0&&uNight>0.01){vec2 sp=floor(uv*uImg*.35);float h=fract(sin(dot(sp,vec2(12.9898,78.233)))*43758.5453);c+=vec3(1.0,.97,.9)*step(.9978,h)*uNight*(.6+.4*sin(uTime*2.0+h*90.0));}
 c=grade(c,D,uv*uImg);
 vec2 q=gl_FragCoord.xy/uScr2-0.5;c*=1.0-dot(q,q)*uVig;
 gl_FragColor=vec4(c,1.0);}`;
const VS_SP=`attribute vec2 aP,aT;attribute vec4 aX;uniform vec3 uView;uniform vec2 uScr;varying vec2 vT,vIp;varying vec4 vX;
void main(){vec2 s=(aP-uView.xy)*uView.z/uScr;gl_Position=vec4(s.x*2.0-1.0,1.0-s.y*2.0,0.0,1.0);vT=aT;vIp=aP;vX=aX;}`;
const FS_SP=PREC+GRADE+`uniform sampler2D uTex,uDat;uniform float uAdd;varying vec2 vT,vIp;varying vec4 vX;
void main(){vec4 t=texture2D(uTex,vT);if(t.a<.03)discard;
 if(vX.w>0.5){float sd=decD(texture2D(uDat,vIp/uImg));if(sd<vX.x-.45)discard;}
 vec3 c=t.rgb;if(vX.w>0.5||(vX.w<-0.5))c=grade(c,vX.x,vIp);
 c+=vec3(1.0,.86,.52)*vX.z*(.45+.25*sin(uTime*6.0));
 float a=t.a*vX.y;if(uAdd>0.5){gl_FragColor=vec4(c*a,a);}else gl_FragColor=vec4(c,a);}`;
function mkProg(vs,fs){const p=gl.createProgram();for(const [t,s] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error('shader: '+gl.getShaderInfoLog(sh));gl.attachShader(p,sh)}gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link: '+gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name)}
  const at={},na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);for(let i=0;i<na;i++){const a=gl.getActiveAttrib(p,i);at[a.name]=gl.getAttribLocation(p,a.name)}return {p,u,at}}
const PBG=mkProg(VS_BG,FS_BG),PSP=mkProg(VS_SP,FS_SP);
const bgBuf=gl.createBuffer(),spBuf=gl.createBuffer();
function texFrom(img,nearest){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);const f=nearest?gl.NEAREST:gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}

/* ---------------- sprite batch ---------------- */
const FL=8;let SB=new Float32Array(6*FL*4000),SN=0;
function sq(p,u0,v0,u1,v1,d,a,g,o){if(SN>=SB.length/(6*FL)-1){const n=new Float32Array(SB.length*2);n.set(SB);SB=n}
  const T=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];let k=SN*6*FL;for(const i of [0,1,2,0,2,3]){SB[k++]=p[i][0];SB[k++]=p[i][1];SB[k++]=T[i][0];SB[k++]=T[i][1];SB[k++]=d;SB[k++]=a;SB[k++]=g;SB[k++]=o}SN++}
/* axis-aligned or rotated rectangle in image px */
function rect(x0,y0,w,h,uv,d,a,g,o,rot,flip){let u0=uv[0],u1=uv[2];if(flip){const t=u0;u0=u1;u1=t}
  if(!rot)return sq([[x0,y0],[x0+w,y0],[x0+w,y0+h],[x0,y0+h]],u0,uv[1],u1,uv[3],d,a,g,o);
  const cx=x0+w/2,cy=y0+h/2,c=Math.cos(rot),s=Math.sin(rot);const P=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>[cx+x*c-y*s,cy+x*s+y*c]);sq(P,u0,uv[1],u1,uv[3],d,a,g,o)}

/* ---------------- textures: atlas + fx ---------------- */
let ATL=null,ATEX=null,FXT=null;const FX={};
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('img '+src));i.src=src})}
async function loadAtlas(){const [im,js]=await Promise.all([loadImg('assets/atlas.webp?v=1794866432'),fetch('assets/atlas.json?v=1794866432').then(r=>r.json())]);
  ATL={};for(const k in js){const [x,y,w,h,fx,fy,mpp]=js[k];ATL[k]={uv:[x/im.width,y/im.height,(x+w)/im.width,(y+h)/im.height],w,h,fx,fy,mpp,x,y,img:im}}ATEX=texFrom(im)}
function buildFx(){const c=mkC(1024,1024),g=c.getContext('2d');const cell=(k,x,y,w,h,fn)=>{g.save();g.translate(x,y);fn(g,w,h);g.restore();FX[k]={uv:[x/1024,y/1024,(x+w)/1024,(y+h)/1024],w,h}};
  const rg=(g,x,y,r,stops)=>{const gd=g.createRadialGradient(x,y,0,x,y,r);stops.forEach(([o,c])=>gd.addColorStop(o,c));return gd};
  cell('glow',0,0,128,128,(g,w,h)=>{g.fillStyle=rg(g,64,64,64,[[0,'rgba(255,255,255,1)'],[.25,'rgba(255,246,222,.75)'],[.6,'rgba(255,232,190,.2)'],[1,'rgba(255,228,180,0)']]);g.fillRect(0,0,w,h)});
  cell('shadow',128,0,128,64,(g,w,h)=>{g.scale(1,.5);g.fillStyle=rg(g,64,64,64,[[0,'rgba(20,16,10,.9)'],[.55,'rgba(20,16,10,.45)'],[1,'rgba(20,16,10,0)']]);g.fillRect(0,0,128,128)});
  cell('ray',256,0,64,512,(g,w,h)=>{for(let x=0;x<w;x++){const u=(x/w-.5)*2,a=Math.exp(-u*u*5);const gd=g.createLinearGradient(0,0,0,h);gd.addColorStop(0,`rgba(255,255,255,0)`);gd.addColorStop(.25,`rgba(255,255,255,${a*.8})`);gd.addColorStop(.9,`rgba(255,255,255,${a})`);gd.addColorStop(1,`rgba(255,255,255,0)`);g.fillStyle=gd;g.fillRect(x,0,1,h)}});
  cell('god',320,0,256,512,(g,w,h)=>{let gd=rg(g,w/2,h*.42,w*.52,[[0,'rgba(255,238,200,.5)'],[1,'rgba(255,220,160,0)']]);g.fillStyle=gd;g.fillRect(0,0,w,h);
    const path=()=>{g.beginPath();g.moveTo(w*.5,h*.1);g.bezierCurveTo(w*.6,h*.1,w*.65,h*.18,w*.63,h*.25);g.bezierCurveTo(w*.73,h*.29,w*.8,h*.37,w*.84,h*.49);g.lineTo(w*.9,h*.58);g.bezierCurveTo(w*.84,h*.6,w*.79,h*.57,w*.74,h*.54);
      g.bezierCurveTo(w*.79,h*.74,w*.84,h*.9,w*.87,h*.99);g.lineTo(w*.13,h*.99);g.bezierCurveTo(w*.16,h*.9,w*.21,h*.74,w*.26,h*.54);g.bezierCurveTo(w*.21,h*.57,w*.16,h*.6,w*.1,h*.58);g.lineTo(w*.16,h*.49);
      g.bezierCurveTo(w*.2,h*.37,w*.27,h*.29,w*.37,h*.25);g.bezierCurveTo(w*.35,h*.18,w*.4,h*.1,w*.5,h*.1);g.closePath()};
    g.shadowColor='rgba(255,224,160,1)';for(const b of [42,24,10]){g.shadowBlur=b;path();const lg=g.createLinearGradient(0,h*.1,0,h);lg.addColorStop(0,'rgba(255,252,242,.95)');lg.addColorStop(.55,'rgba(255,240,206,.82)');lg.addColorStop(1,'rgba(255,222,170,.06)');g.fillStyle=lg;g.fill()}
    g.shadowBlur=0;g.strokeStyle='rgba(220,190,140,.18)';g.lineWidth=3;for(const x of [.42,.5,.58]){g.beginPath();g.moveTo(w*x,h*.45);g.quadraticCurveTo(w*(x+.03),h*.7,w*(x+.05),h*.96);g.stroke()}
    gd=rg(g,w/2,h*.36,w*.26,[[0,'rgba(255,255,255,1)'],[1,'rgba(255,255,255,0)']]);g.fillStyle=gd;g.fillRect(0,0,w,h)});
  cell('angel',576,0,256,256,(g,w,h)=>{const cx=w/2;g.fillStyle=rg(g,cx,h*.42,w*.42,[[0,'rgba(255,240,205,.35)'],[1,'rgba(255,225,170,0)']]);g.fillRect(0,0,w,h);
    g.shadowColor='rgba(255,232,185,.95)';g.shadowBlur=8;g.lineCap='round';
    for(const s of [-1,1]){g.beginPath();g.moveTo(cx+s*8,h*.37);g.bezierCurveTo(cx+s*60,h*.04,cx+s*118,h*.08,cx+s*119,h*.3);g.bezierCurveTo(cx+s*102,h*.52,cx+s*60,h*.64,cx+s*13,h*.56);g.closePath();
      const wg=g.createLinearGradient(cx,0,cx+s*120,0);wg.addColorStop(0,'rgba(255,248,232,.6)');wg.addColorStop(1,'rgba(255,240,210,.2)');g.fillStyle=wg;g.fill();
      for(let k=0;k<12;k++){const t=k/11;g.beginPath();g.moveTo(cx+s*10,h*.37);g.quadraticCurveTo(cx+s*(20+60*t),h*(.1+.2*t),cx+s*(35+82*Math.sin(t*1.45+.15)),h*(.12+.5*t));g.lineWidth=5-3*t;g.strokeStyle=`rgba(255,250,236,${.5-.22*t})`;g.stroke()}}
    g.beginPath();g.arc(cx,h*.3,9,0,TAU);g.fillStyle='rgba(255,250,238,.95)';g.fill();
    g.beginPath();g.moveTo(cx-14,h*.37);g.quadraticCurveTo(cx,h*.33,cx+14,h*.37);g.lineTo(cx+29,h*.97);g.lineTo(cx-29,h*.97);g.closePath();
    const r2=g.createLinearGradient(0,h*.35,0,h);r2.addColorStop(0,'rgba(255,250,238,.92)');r2.addColorStop(1,'rgba(255,232,190,.05)');g.fillStyle=r2;g.fill();
    g.strokeStyle='rgba(255,220,150,.75)';g.lineWidth=2;g.beginPath();g.ellipse(cx,h*.255,12,3.5,0,0,TAU);g.stroke()});
  cell('cloud',576,256,256,256,(g,w,h)=>{const r=rng(44);for(let i=0;i<26;i++){const x=128+(r()-.5)*150,y=128+(r()-.5)*80,rad=30+r()*60;g.fillStyle=rg(g,x,y,rad,[[0,'rgba(255,255,255,.35)'],[1,'rgba(255,255,255,0)']]);g.fillRect(0,0,w,h)}});
  cell('rays',0,512,256,256,(g,w,h)=>{g.translate(128,128);for(let i=0;i<48;i++){g.rotate(TAU/48);const L=60+((i*37)%5)*14;const gd=g.createLinearGradient(0,0,0,-L);gd.addColorStop(0,'rgba(255,240,200,.5)');gd.addColorStop(1,'rgba(255,240,200,0)');g.fillStyle=gd;g.fillRect(-1.2,0,2.4,-L)}});
  cell('dove',832,0,64,64,(g,w,h)=>{g.fillStyle='rgba(248,246,240,.95)';g.beginPath();g.ellipse(32,36,12,6,0,0,TAU);g.fill();g.beginPath();g.moveTo(26,34);g.quadraticCurveTo(12,10,2,14);g.quadraticCurveTo(16,26,30,38);g.fill();g.beginPath();g.moveTo(36,34);g.quadraticCurveTo(52,10,62,14);g.quadraticCurveTo(48,26,34,38);g.fill();g.beginPath();g.arc(44,33,4,0,TAU);g.fill()});
  cell('spark',896,0,32,32,(g,w,h)=>{g.fillStyle=rg(g,16,16,16,[[0,'rgba(255,255,255,1)'],[.3,'rgba(255,240,200,.6)'],[1,'rgba(255,230,180,0)']]);g.fillRect(0,0,w,h)});
  cell('rain',928,0,8,64,(g,w,h)=>{const gd=g.createLinearGradient(0,0,0,h);gd.addColorStop(0,'rgba(200,215,230,0)');gd.addColorStop(1,'rgba(220,230,240,.75)');g.fillStyle=gd;g.fillRect(3,0,2,h)});
  cell('bird',944,0,64,32,(g,w,h)=>{g.strokeStyle='rgba(30,28,30,.9)';g.lineWidth=3;g.lineCap='round';g.beginPath();g.moveTo(4,10);g.quadraticCurveTo(18,4,32,18);g.quadraticCurveTo(46,4,60,10);g.stroke()});
  cell('bfly',896,32,32,32,(g,w,h)=>{g.fillStyle='rgba(240,236,228,.95)';g.beginPath();g.ellipse(10,14,8,9,-.4,0,TAU);g.ellipse(22,14,8,9,.4,0,TAU);g.fill();g.fillStyle='rgba(60,40,20,.9)';g.fillRect(15,8,2,16)});
  cell('ring',832,64,128,128,(g,w,h)=>{g.strokeStyle='rgba(255,255,255,1)';g.lineWidth=5;g.shadowColor='rgba(255,230,170,1)';g.shadowBlur=10;g.beginPath();g.ellipse(64,64,56,56,0,0,TAU);g.stroke()});
  cell('leaf',960,32,32,32,(g,w,h)=>{g.fillStyle='rgba(120,96,50,.95)';g.beginPath();g.ellipse(16,16,12,5,.6,0,TAU);g.fill()});
  cell('rainbow',256,512,512,256,(g,w,h)=>{['#c86a5a','#c8945a','#c8b85a','#78a86a','#5a8ab8','#6a6ab0','#8a6aa8'].forEach((c,k)=>{g.strokeStyle=c;g.globalAlpha=.55;g.lineWidth=9;g.beginPath();g.arc(256,256,240-k*9,Math.PI,0);g.stroke()});g.globalAlpha=1});
  cell('flame',768,512,128,256,(g,w,h)=>{for(let i=0;i<5;i++){const gd=g.createRadialGradient(64,170-i*22,4,64,170-i*22,60-i*8);gd.addColorStop(0,'rgba(255,240,190,.9)');gd.addColorStop(.4,'rgba(255,150,60,.55)');gd.addColorStop(1,'rgba(200,60,20,0)');g.fillStyle=gd;g.fillRect(0,0,w,h)}});
  FXT=texFrom(c)}

/* ---------------- scenes ---------------- */
const SC={};let S=null,S2=null;
async function loadScene(name){if(SC[name]&&SC[name].ready)return SC[name];if(SC[name]&&SC[name].p)return SC[name].p;const o={name};SC[name]=o;
  o.p=(async()=>{const [img,dat,meta]=await Promise.all([loadImg(`assets/scenes/${name}.webp?v=1794866432`),loadImg(`assets/scenes/${name}_d.webp?v=1794866432`),fetch(`assets/scenes/${name}.json?v=1794866432`).then(r=>r.json())]);
    Object.assign(o,meta);o.img=img;o.tex=texFrom(img);o.dtex=texFrom(dat,true);o.grid=new Map();o.byH=[];
    for(const s of o.spots){o.grid.set(s[0]*4096+s[1],s);o.byH.push(s)}o.byH.sort((a,b)=>b[5]-a[5]);
    /* depth sampler on CPU (for hit tests / hiding) */
    try{const c=mkC(dat.width,dat.height),g=c.getContext('2d');g.drawImage(dat,0,0);o.dpx=g.getImageData(0,0,dat.width,dat.height).data;o.dw=dat.width;o.dh=dat.height}catch(e){o.dpx=null}
    o.ready=true;return o})();return o.p}
function sceneDepth(sc,x,y){if(!sc.dpx)return 1e9;const i=(clamp(Math.floor(y/2),0,sc.dh-1)*sc.dw+clamp(Math.floor(x/2),0,sc.dw-1))*4;const t=(sc.dpx[i]*256+sc.dpx[i+1])/65535;return .1*Math.exp(t*11.40756)}
/* world grid sampling: (wx,wz) meters -> painted position */
function gs(sc,i,j){return sc.grid.get(i*4096+j)}
function samp(sc,wx,wz){const fi=wx+sc.E-1,fj=wz+sc.E-1,i=Math.floor(fi),j=Math.floor(fj),u=fi-i,v=fj-j;
  const P=[[gs(sc,i,j),(1-u)*(1-v)],[gs(sc,i+1,j),u*(1-v)],[gs(sc,i,j+1),(1-u)*v],[gs(sc,i+1,j+1),u*v]];let ws=0,x=0,y=0,z=0,h=0,oc=0;
  for(const [s,w] of P)if(s){ws+=w+1e-4;x+=s[2]*(w+1e-4);y+=s[3]*(w+1e-4);z+=s[4]*(w+1e-4);h+=s[5]*(w+1e-4);oc+=s[6]*(w+1e-4)}
  if(!ws)return null;return {x:x/ws,y:y/ws,z:z/ws,h:h/ws,occ:oc/ws}}
const walkable=(sc,wx,wz)=>{const fi=Math.round(wx+sc.E-1),fj=Math.round(wz+sc.E-1);return !!gs(sc,fi,fj)};
const spotW=(sc,s)=>[s[0]-sc.E+1,s[1]-sc.E+1];
function nearestSpot(sc,ix,iy,filt){let best=null,bd=1e18;for(const s of sc.spots){if(filt&&!filt(s))continue;const d=(s[2]-ix)**2+(s[3]-iy)**2;if(d<bd){bd=d;best=s}}return best}

/* ---------------- view (pan / zoom over the painting) ---------------- */
const V={ox:0,oy:0,s:1,g:null,spd:3};
function sMin(){return S?Math.max(CW/S.W,CH/S.H):1}
function sMax(){return sMin()*(typeof state!=='undefined'&&(state==='visit'||state==='cut'||state==='found')?6:(LIGHT?4.5:6.5))}
function clampView(v){if(!S)return;v.s=clamp(v.s,sMin(),sMax());v.ox=clamp(v.ox,0,Math.max(0,S.W-CW/v.s));v.oy=clamp(v.oy,0,Math.max(0,S.H-CH/v.s))}
function viewTo(ix,iy,s,spd){V.g={cx:ix,cy:iy,s:clamp(s,sMin(),sMax())};V.spd=spd||3}
function viewCenter(){return [V.ox+CW/V.s/2,V.oy+CH/V.s/2]}
function updView(dt){if(!V.g)return;V.g.t=(V.g.t||0)+dt;if(V.g.t>7){V.g=null;return}const [cx,cy]=viewCenter();const k=1-Math.exp(-dt*V.spd);
  const ns=Math.exp(lerp(Math.log(V.s),Math.log(V.g.s),k));const ncx=lerp(cx,V.g.cx,k),ncy=lerp(cy,V.g.cy,k);V.s=ns;V.ox=ncx-CW/V.s/2;V.oy=ncy-CH/V.s/2;clampView(V);
  if(Math.abs(V.s-V.g.s)<V.g.s*.002&&Math.hypot(ncx-V.g.cx,ncy-V.g.cy)<1)V.g=null}
const toImg=(sx,sy)=>[V.ox+sx/V.s,V.oy+sy/V.s];
const toScr=(ix,iy)=>[(ix-V.ox)*V.s,(iy-V.oy)*V.s];

/* ================= ACTORS (people & animals walking on the painted ground) ================= */
const NAMES={adam:'Adão',eve:'Eva',cain:'Caim',abel:'Abel'};
function mkActor(kind,wx,wz,o={}){return Object.assign({kind,skin:kind,x:wx,z:wz,tx:wx,tz:wz,home:[wx,wz],walk:false,t:rnd(1,3),ph:R()*6,face:1,back:false,pose:null,
  alpha:1,glow:0,sel:false,got:false,dust:0,sp:o.sp||.9,wander:!!o.wander,hide:false,scale:1,lastS:null,a:true,noOcc:false},o)}
let actors=[],animals=[];
function actorCell(A){const base=A.skin;if(A.pose)return ATL[base+'_'+A.pose]||ATL[base+'_stand'];
  if(A.walk){const f=Math.floor(A.ph)%6;return ATL[base+(A.back?'_back':'_walk')+f]||ATL[base+'_stand']}return ATL[base+'_stand']}
function stepActor(A,dt,speedMul=1){if(!S)return;
  if(A.walk){const dx=A.tx-A.x,dz=A.tz-A.z,d=Math.hypot(dx,dz);const sp=A.sp*speedMul;
    if(d<.08){A.walk=false;A.t=rnd(1.5,4)}else{const st=Math.min(d,sp*dt),nx=A.x+dx/d*st,nz=A.z+dz/d*st;
      if(!A.free&&!walkable(S,nx,nz)){A.walk=false;A.t=rnd(.5,1.5)}else{const a=samp(S,A.x,A.z),b=samp(S,nx,nz);
        if(a&&b){const sx=b.x-a.x,sy=b.y-a.y;if(Math.abs(sx)>.02)A.face=sx>0?1:-1;A.back=sy<-Math.abs(sx)*1.1}A.x=nx;A.z=nz;A.ph+=dt*sp*7}}}
  else if(A.wander&&!A.sel&&!A.got){A.t-=dt;if(A.t<=0){for(let k=0;k<8;k++){const a=R()*TAU,r=rnd(1.5,5),tx=A.home[0]+Math.cos(a)*r,tz=A.home[1]+Math.sin(a)*r;if(walkable(S,tx,tz)){A.tx=tx;A.tz=tz;A.walk=true;break}}A.t=rnd(2,5)}}}
function goTo(A,tx,tz){A.tx=tx;A.tz=tz;A.walk=true}
function drawActor(A,o={}){if(!A.a||A.alpha<=.01)return;const s=samp(S,A.x,A.z);if(!s)return;A.lastS=s;const c=o.cell||actorCell(A);if(!c)return;
  const ppm=s.h/1.75,k=ppm*c.mpp*(A.scale||1),w=c.w*k,h=c.h*k;const flip=A.face<0;
  const fx=flip?(c.w-c.fx):c.fx,x0=s.x-fx*k,y0=s.y-c.fy*k+(o.dy||0)*ppm;const occ=A.noOcc?-1:1;
  if(!o.noShadow)rect(s.x-.42*ppm*(A.scale||1),s.y-.09*ppm,.84*ppm*(A.scale||1),.2*ppm,FX.shadow.uv,s.z-.3,.42*A.alpha,0,occ);
  rect(x0,y0,w,h,c.uv,s.z,A.alpha,A.glow,occ,o.rot||0,flip);A.box=[x0,y0,w,h,s.x,s.y]}
/* animals */
const ANK={mixed:{sheep:1,deer:1,rabbit:1,lion:.5,elephant:.25,horse:.5,monkey:.6,tortoise:.4,dove:.8},pasture:{sheep:2,goat:1,horse:.6,deer:.6,rabbit:.8,dove:.6,monkey:.3},
  forest:{deer:1.6,rabbit:1,horse:.4,lion:.3,monkey:.6,dove:.4,tortoise:.4},village:{sheep:1.4,goat:1.2,horse:.6,camel:.4,dove:1,monkey:.3},desert:{camel:1.4,goat:1,lion:.4,dove:.5,tortoise:.5,monkey:.3}};
const THA={eden:'mixed',valley:'pasture',ruins:'forest',village:'village',hills:'pasture',east:'desert'};
const ASP={deer:1.1,sheep:.45,goat:.6,rabbit:1.2,lion:.8,elephant:.5,camel:.55,horse:1.2,monkey:.7,tortoise:.15,dove:.5};
function spawnAnimals(n,fallen){animals=[];const tab=ANK[THA[S.th]||'mixed'];const keys=Object.keys(tab),tot=keys.reduce((a,k)=>a+tab[k],0);
  for(let i=0;i<n;i++){let r=R()*tot,k=keys[0];for(const kk of keys){r-=tab[kk];if(r<=0){k=kk;break}}
    const s=pick(S.spots);if(!s)break;const [wx,wz]=spotW(S,s);const A=mkActor(k,wx,wz,{sp:ASP[k]*rnd(.8,1.15),wander:true,animal:true,face:R()<.5?1:-1});
    A.thin=fallen;A.lying=fallen&&R()<.3;if(A.lying)A.wander=false;animals.push(A)}}
function drawAnimal(A){const s=samp(S,A.x,A.z);if(!s)return;let name='a_'+A.kind+(A.lying?'_lying':(A.thin?'_thin':'_')+(A.walk?Math.floor(A.ph*.6)%4:0));const c=ATL[name]||ATL['a_'+A.kind+'_0'];if(!c)return;
  const ppm=s.h/1.75,k=ppm*c.mpp,w=c.w*k,h=c.h*k,flip=A.face<0;const fx=flip?(c.w-c.fx):c.fx;
  const bob=A.walk?Math.abs(Math.sin(A.ph*1.2))*.03*ppm:0;
  rect(s.x-.5*ppm*c.mpp*c.w/2.4,s.y-.08*ppm,ppm*c.mpp*c.w/1.2,.18*ppm,FX.shadow.uv,s.z-.3,.32,0,1);
  rect(s.x-fx*k,s.y-c.fy*k-bob,w,h,c.uv,s.z,A.alpha??1,0,1,0,flip)}

/* ================= ENVIRONMENT (time of day, weather) ================= */
const env={t:.35,cloud:.1,rain:0,fog:0,storm:0,wt:'clear',wTimer:20,flash:0,nextBolt:8,day:1,dusk:0,vc:0,wind:.5,dark:0,fallK:0};
const WPRE={clear:{cloud:.1,rain:0,fog:0,storm:0},cloudy:{cloud:.75,rain:0,fog:.1,storm:0},rain:{cloud:.9,rain:1,fog:.25,storm:0},
 fog:{cloud:.45,rain:0,fog:1,storm:0},storm:{cloud:1,rain:1,fog:.3,storm:1},mist:{cloud:.3,rain:0,fog:.5,storm:0},broken:{cloud:.5,rain:0,fog:.12,storm:0}};
const G={tint:[1,1,1],sat:1,fogK:0,fogD:200,fogC:[.8,.8,.8],night:0,fall:0,flash:0,dark:0,glowP:[0,0,1],glowC:[0,0,0],vig:.55,mix:0,mixC:[0,0],wind:.5};
const rainP=[];for(let i=0;i<700;i++)rainP.push([Math.random(),Math.random(),.6+Math.random()*.6]);
const birds=[];for(let i=0;i<9;i++)birds.push({x:Math.random(),y:.05+Math.random()*.12,v:(Math.random()<.5?-1:1)*(.012+Math.random()*.02),ph:Math.random()*6});
const flies=[];for(let i=0;i<70;i++)flies.push([Math.random(),Math.random(),Math.random()*6]);
let CFG=null;
function updateEnv(dt){const cfg=CFG;if(!cfg)return;
  if(state==='play'||state==='title')env.t=(env.t+dt/cfg.dayLen)%1;
  env.wTimer-=dt;if(env.wTimer<=0&&state==='play'){let n=pick(cfg.pool);if(n===env.wt)n=pick(cfg.pool);env.wt=n;env.wTimer=rnd(cfg.wDur[0],cfg.wDur[1])}
  const tg=WPRE[env.wt],k=1-Math.exp(-dt/5);for(const key of ['cloud','rain','fog','storm'])env[key]=lerp(env[key],tg[key],k);
  const elev=Math.sin((env.t-.25)*TAU);const day=smooth(-.14,.2,elev),dusk=Math.exp(-Math.pow(elev/.22,2));env.day=day;env.dusk=dusk;
  if(env.storm>.5&&state==='play'){env.nextBolt-=dt;if(env.nextBolt<=0){env.nextBolt=rnd(6,14);env.flash=1;AU.thunder(rnd(.3,1.8))}}
  env.flash*=Math.exp(-dt*6);const fl=env.flash>.05?env.flash*(.55+.45*Math.sin(performance.now()*.07)):0;
  const cl=env.cloud,rn=env.rain,fg=env.fog,fall=env.fallK;
  let tr=1,tg_=1,tb=1;const dk=1-cl*.22-rn*.2;tr*=dk;tg_*=dk;tb*=dk;
  tr*=1+dusk*.12;tg_*=1-dusk*.02;tb*=1-dusk*.14;
  if(fall>0){tr*=1-fall*.12;tg_*=1-fall*.1;tb*=1-fall*.02}
  G.tint=[tr,tg_,tb];G.sat=1-cl*.2-rn*.15-fall*.2;G.night=(1-day)*.82;
  G.fogK=clamp(fg*.75+rn*.25+(cfg.fogBase||0)+fall*.12,0,.85);G.fogD=lerp(260,45,clamp(fg+rn*.3,0,1));
  const fc=[lerp(.62,.82,day),lerp(.66,.82,day),lerp(.74,.84,day)];G.fogC=fc.map(v=>v*(1-(1-day)*.75));
  G.flash=fl*.55;G.fall=fall*.5;
  env.wind=(.35+cl*.35+rn*.7+env.storm*.6)*(1-env.vc*.6)+(fall?.3:0);G.wind=LIGHT?0:env.wind;
  return {day,dusk,elev,cloud:cl,rain:rn,fog:fg,storm:env.storm}}
function envLabel(e){const t=env.t;let s;
  if(t<.2)s='🌙 Madrugada';else if(t<.29)s='🌅 Aurora';else if(t<.45)s='☀️ Manhã';else if(t<.58)s='☀️ Meio-dia';else if(t<.69)s='☀️ Tarde';else if(t<.79)s='🌇 Viração do dia';else s='🌙 Noite';
  if(e.storm>.5)s+=' · ⛈️ Tempestade';else if(e.rain>.45)s+=' · 🌧️ Chuva';else if(e.fog>.45)s+=' · 🌫️ Neblina';else if(e.cloud>.6)s+=' · ☁️ Nublado';return s}

/* ================= RENDER ================= */
function setGradeU(P){gl.uniform3fv(P.u.uTint,G.tint);gl.uniform1f(P.u.uSat,G.sat);gl.uniform1f(P.u.uFogK,G.fogK);gl.uniform1f(P.u.uFogD,G.fogD);gl.uniform3fv(P.u.uFogC,G.fogC);
  gl.uniform1f(P.u.uNight,G.night);gl.uniform1f(P.u.uFall,G.fall);gl.uniform1f(P.u.uFlash,G.flash);gl.uniform1f(P.u.uDark,G.dark);gl.uniform3fv(P.u.uGlowP,G.glowP);gl.uniform3fv(P.u.uGlowC,G.glowC);
  gl.uniform1f(P.u.uTime,TT%1000);gl.uniform2f(P.u.uImg,S.W,S.H)}
let TT=0;
function render(){gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);if(!S||!S.ready)return;
  const view=[V.ox,V.oy,V.s];
  /* background */
  gl.disable(gl.BLEND);gl.useProgram(PBG.p);setGradeU(PBG);gl.uniform3fv(PBG.u.uView,view);gl.uniform2f(PBG.u.uScr,CW,CH);gl.uniform2f(PBG.u.uScr2,cv.width,cv.height);
  gl.uniform1f(PBG.u.uWind,G.wind);gl.uniform1f(PBG.u.uVig,G.vig);gl.uniform1f(PBG.u.uFx,LIGHT?0:1);gl.uniform1f(PBG.u.uMix,S2?G.mix:0);gl.uniform2fv(PBG.u.uMixC,G.mixC);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,S.tex);gl.uniform1i(PBG.u.uBg,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,S.dtex);gl.uniform1i(PBG.u.uDat,1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,(S2||S).tex);gl.uniform1i(PBG.u.uBg2,2);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,(S2||S).dtex);gl.uniform1i(PBG.u.uDat2,3);
  gl.bindBuffer(gl.ARRAY_BUFFER,bgBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,S.W,0,S.W,S.H,0,0,S.W,S.H,0,S.H]),gl.STREAM_DRAW);
  gl.enableVertexAttribArray(PBG.at.aP);gl.vertexAttribPointer(PBG.at.aP,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(PBG.at.aP);
  /* sprites */
  gl.enable(gl.BLEND);gl.useProgram(PSP.p);setGradeU(PSP);gl.uniform3fv(PSP.u.uView,view);gl.uniform2f(PSP.u.uScr,CW,CH);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,S.dtex);gl.uniform1i(PSP.u.uDat,1);
  const draw=(tex,add,fill)=>{SN=0;fill();if(!SN)return;gl.blendFunc(add?gl.ONE:gl.SRC_ALPHA,add?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.uniform1f(PSP.u.uAdd,add?1:0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(PSP.u.uTex,0);gl.bindBuffer(gl.ARRAY_BUFFER,spBuf);gl.bufferData(gl.ARRAY_BUFFER,SB.subarray(0,SN*6*FL),gl.STREAM_DRAW);
    const st=FL*4;gl.enableVertexAttribArray(PSP.at.aP);gl.vertexAttribPointer(PSP.at.aP,2,gl.FLOAT,false,st,0);gl.enableVertexAttribArray(PSP.at.aT);gl.vertexAttribPointer(PSP.at.aT,2,gl.FLOAT,false,st,8);
    gl.enableVertexAttribArray(PSP.at.aX);gl.vertexAttribPointer(PSP.at.aX,4,gl.FLOAT,false,st,16);gl.drawArrays(gl.TRIANGLES,0,SN*6);
    gl.disableVertexAttribArray(PSP.at.aP);gl.disableVertexAttribArray(PSP.at.aT);gl.disableVertexAttribArray(PSP.at.aX)};
  /* shadows first (fx), then everyone sorted far->near (atlas) */
  const list=[];for(const A of animals)list.push(['a',A]);for(const A of actors)if(A.a)list.push(['h',A]);
  for(const it of list){const s=samp(S,it[1].x,it[1].z);it[2]=s?s.z:0}list.sort((a,b)=>b[2]-a[2]);
  draw(FXT,false,()=>{for(const [t,A] of list){const s=samp(S,A.x,A.z);if(!s||(A.alpha??1)<.05||A.noShadow)continue;const ppm=s.h/1.75,w=(t==='a'?(A.kind==='elephant'?2.4:A.kind==='camel'||A.kind==='horse'?1.6:A.kind==='rabbit'||A.kind==='dove'?.4:1.1):.8)*ppm*(A.scale||1);
    rect(s.x-w/2,s.y-.1*ppm,w,.22*ppm,FX.shadow.uv,s.z-.4,.36*(A.alpha??1)*(1-G.night*.6),0,1)}});
  draw(ATEX,false,()=>{for(const [t,A] of list){if(t==='a')drawAnimalNS(A);else drawActorNS(A)}if(fxUnder)fxUnder()});
  /* additive & overlay effects */
  draw(FXT,true,()=>{drawFxAdd()});
  draw(FXT,false,()=>{drawFxNorm()});
}
function drawActorNS(A){const sh=A.noShadow;A.noShadow=true;drawActor(A,{noShadow:true,cell:A.cellOv,rot:A.rot});A.noShadow=sh}
function drawAnimalNS(A){const s=samp(S,A.x,A.z);if(!s)return;let name='a_'+A.kind+(A.lying?'_lying':(A.thin?'_thin':'_')+(A.walk?Math.floor(A.ph*.6)%4:0));const c=ATL[name]||ATL['a_'+A.kind+'_0'];if(!c)return;
  const ppm=s.h/1.75,k=ppm*c.mpp,w=c.w*k,h=c.h*k,flip=A.face<0;const fx=flip?(c.w-c.fx):c.fx;const bob=A.walk?Math.abs(Math.sin(A.ph*1.2))*.03*ppm:0;
  rect(s.x-fx*k,s.y-c.fy*k-bob,w,h,c.uv,s.z,A.alpha??1,0,1,0,flip);A.box=[s.x-fx*k,s.y-c.fy*k,w,h,s.x,s.y]}
let fxUnder=null;
/* weather particles & ambient life (screen-anchored but drawn in image space) */
function drawFxAdd(){const [x0,y0]=[V.ox,V.oy],vw=CW/V.s,vh=CH/V.s;
  if(G.night>.3&&env.rain<.4&&!env.fallK){const k=(G.night-.3)*1.4;for(const f of flies){const x=x0+((f[0]+Math.sin(TT*.2+f[2])*.02)%1)*vw,y=y0+(.45+f[1]*.55+Math.sin(TT*.7+f[2])*.01)*vh;const a=k*(.5+.5*Math.sin(TT*3+f[2]*7));const r=5/V.s*(1+f[2]*.1);
    rect(x-r,y-r,2*r,2*r,FX.glow.uv,0,a,0,0)}}
  if(fxAdd)fxAdd(x0,y0,vw,vh)}
let fxAdd=null,fxNorm=null;
function drawFxNorm(){const [x0,y0]=[V.ox,V.oy],vw=CW/V.s,vh=CH/V.s;
  /* rain */
  if(env.rain>.03){const n=Math.floor(rainP.length*clamp(env.rain,0,1)),sl=.25+env.wind*.15;for(let i=0;i<n;i++){const p=rainP[i];const y=((p[1]+TT*p[2]*1.4)%1.1)-.05,x=((p[0]+y*sl*.25)%1);
    const L=60/V.s*p[2],W=3/V.s;rect(x0+x*vw,y0+y*vh-L,W,L,FX.rain.uv,0,.5*env.rain,0,0,-sl*.25)}}
  /* birds by day */
  if(env.day>.5&&env.rain<.4&&!env.fallK&&state!=='visit'){for(const b of birds){b.x+=b.v*.016;if(b.x>1.1)b.x=-.1;if(b.x<-.1)b.x=1.1;const fl=Math.abs(Math.sin(TT*8+b.ph));const w=34/V.s,h=16/V.s*(.4+.6*fl);
    rect(x0+b.x*vw,y0+(b.y+Math.sin(TT*.6+b.ph)*.01)*vh,w,h,FX.bird.uv,0,.75,0,0,0,b.v<0)}}
  /* falling dry leaves in the fallen world */
  if(env.fallK>.3){for(let i=0;i<40;i++){const p=rainP[i];const y=((p[1]+TT*.05*p[2])%1.1)-.05,x=(p[0]+Math.sin(TT*.5+i)*.03+TT*.01*env.wind)%1;const r=10/V.s;rect(x0+x*vw,y0+y*vh,r,r,FX.leaf.uv,0,.7*env.fallK,0,0,TT*2+i)}}
  if(fxNorm)fxNorm(x0,y0,vw,vh)}

/* ================= INPUT ================= */
const pts=new Map();let tap=null,pinch=null,lastGesture=0,velX=0,velY=0;
const canInput=()=>state==='play'||state==='mission';
cv.addEventListener('pointerdown',e=>{if(!canInput())return;cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});V.g=null;velX=velY=0;
  if(pts.size===1)tap={x:e.clientX,y:e.clientY,t:performance.now(),mv:0};else{tap=null;startPinch()}});
function startPinch(){lastGesture=performance.now();const a=[...pts.values()];if(a.length<2)return;pinch={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),s:V.s,mx:(a[0].x+a[1].x)/2,my:(a[0].y+a[1].y)/2}}
cv.addEventListener('pointermove',e=>{const p=pts.get(e.pointerId);if(!p||!canInput())return;const ox=p.x,oy=p.y;p.x=e.clientX;p.y=e.clientY;
  if(pts.size===1){if(tap)tap.mv+=Math.abs(p.x-ox)+Math.abs(p.y-oy);V.ox-=(p.x-ox)/V.s;V.oy-=(p.y-oy)/V.s;velX=(p.x-ox);velY=(p.y-oy);clampView(V)}
  else if(pinch&&pts.size>=2){const a=[...pts.values()];const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),mx=(a[0].x+a[1].x)/2,my=(a[0].y+a[1].y)/2;
    const [ix,iy]=toImg(pinch.mx,pinch.my);V.s=clamp(pinch.s*d/Math.max(pinch.d,1),sMin(),sMax());V.ox=ix-mx/V.s;V.oy=iy-my/V.s;pinch.mx=mx;pinch.my=my;pinch.s=V.s;pinch.d=d;clampView(V)}});
function upPtr(e){pts.delete(e.pointerId);const now=performance.now();if(tap&&tap.mv<8&&now-tap.t<400&&pts.size===0&&now-lastGesture>300)onTap(e.clientX,e.clientY);else if(tap&&tap.mv>=8)lastGesture=now;
  tap=null;if(pinch&&pts.size<2){pinch=null;lastGesture=now;velX=velY=0}}
cv.addEventListener('pointerup',upPtr);cv.addEventListener('pointercancel',e=>{pts.delete(e.pointerId);tap=null;pinch=null});
cv.addEventListener('wheel',e=>{if(!canInput())return;e.preventDefault();V.g=null;const [ix,iy]=toImg(e.clientX,e.clientY);V.s=clamp(V.s*Math.exp(-e.deltaY*.0015),sMin(),sMax());V.ox=ix-e.clientX/V.s;V.oy=iy-e.clientY/V.s;clampView(V)},{passive:false});
function zoomBy(f){const [cx,cy]=viewCenter();viewTo(cx,cy,V.s*f,5);AU.click()}
$('zIn').onclick=()=>zoomBy(1.8);$('zOut').onclick=()=>zoomBy(1/1.8);
function inertia(dt){if(pts.size||Math.abs(velX)+Math.abs(velY)<.3)return;V.ox-=velX/V.s;V.oy-=velY/V.s;const k=Math.exp(-dt*6);velX*=k;velY*=k;clampView(V)}

const AU={ctx:null,on:save.sound,
  init(){if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();return}
    try{const C=window.AudioContext||window.webkitAudioContext;this.ctx=new C()}catch(e){return}
    const c=this.ctx;this.master=c.createGain();this.master.gain.value=this.on?.9:0;const comp=c.createDynamicsCompressor();this.master.connect(comp);comp.connect(c.destination);
    const len=c.sampleRate*2,b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;this.nb=b;
    const brown=c.createBuffer(1,len,c.sampleRate),bd=brown.getChannelData(0);let last=0;for(let i=0;i<len;i++){last=(last+.02*(Math.random()*2-1))/1.02;bd[i]=last*3.5}this.bb=brown;
    const chain=(buf,nodes,g0)=>{const s=c.createBufferSource();s.buffer=buf;s.loop=true;let n=s;for(const x of nodes){n.connect(x);n=x}const g=c.createGain();g.gain.value=g0;n.connect(g);g.connect(this.master);s.start(0,Math.random()*1.5);return g};
    const f=(type,fr,q)=>{const x=c.createBiquadFilter();x.type=type;x.frequency.value=fr;if(q)x.Q.value=q;return x};
    this.windF=f('lowpass',380,.6);this.wind=chain(this.bb,[this.windF],0);
    this.stream1=chain(this.nb,[f('bandpass',1100,.9)],0);this.stream2=chain(this.nb,[f('bandpass',2700,1.3)],0);this.streamLo=chain(this.bb,[f('lowpass',500)],0);
    this.rainHi=chain(this.nb,[f('highpass',1100),f('lowpass',7000)],0);this.rainLo=chain(this.bb,[f('lowpass',700)],0);this.leaves=chain(this.nb,[f('bandpass',4200,.7)],0);
    this.tBird=1;this.tCrick=1;this.tOwl=20;this.tStream=0},
  set(on){this.on=on;if(this.master)this.master.gain.setTargetAtTime(on?.9:0,this.ctx.currentTime,.2)},
  g(node,v,tc=.5){node.gain.setTargetAtTime(v,this.ctx.currentTime,tc)},
  update(dt,e){if(!this.ctx||!this.on)return;const c=this.ctx,wind=env.wind,day=e.day,night=1-day,quiet=1-env.vc*.7;
    this.g(this.wind,(.05+wind*.09)*quiet,1.2);this.windF.frequency.setTargetAtTime(220+wind*480+Math.sin(c.currentTime*.37)*90,c.currentTime,1);this.g(this.leaves,(.004+wind*.012*(1-e.rain*.5))*quiet,1);
    this.tStream-=dt;if(this.tStream<=0){this.tStream=.14;const k=.6+Math.random()*.8;this.g(this.stream1,.026*k*quiet,.08);this.g(this.stream2,.011*(2-k)*quiet,.08);this.g(this.streamLo,.05*quiet,.5)}
    this.g(this.rainHi,e.rain*.16,.8);this.g(this.rainLo,e.rain*.09+e.storm*.05,.8);
    this.tBird-=dt;if(this.tBird<=0){this.tBird=.5+Math.random()*2.6/(.3+day);if(day>.4&&e.rain<.5&&env.vc<.2&&Math.random()<.85)this.bird()}
    this.tCrick-=dt;if(this.tCrick<=0){this.tCrick=.25+Math.random()*.6;if(night>.5&&e.rain<.5)this.cricket(night*quiet)}
    this.tOwl-=dt;if(this.tOwl<=0){this.tOwl=14+Math.random()*25;if(night>.7&&e.rain<.3&&env.vc<.2)this.owl()}},
  pan(){const c=this.ctx;if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=Math.random()*1.6-.8;p.connect(this.master);return p}return this.master},
  env(o,g,t,a,peak,dec){g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec)},
  bird(){const c=this.ctx,t=c.currentTime+.02,o=c.createOscillator(),g=c.createGain();o.type='sine';const base=2000+Math.random()*2600,n=2+Math.floor(Math.random()*5),gap=.07+Math.random()*.09,v=.025+Math.random()*.03;
    g.gain.value=.0001;for(let i=0;i<n;i++){const s=t+i*gap;o.frequency.setValueAtTime(base*(.9+Math.random()*.2),s);o.frequency.exponentialRampToValueAtTime(base*(1.15+Math.random()*.5),s+gap*.6);
      g.gain.setValueAtTime(.0001,s);g.gain.linearRampToValueAtTime(v,s+.012);g.gain.exponentialRampToValueAtTime(.0001,s+gap*.8)}o.connect(g);g.connect(this.pan());o.start(t);o.stop(t+n*gap+.1)},
  cricket(k){const c=this.ctx,t=c.currentTime+.02,o=c.createOscillator(),g=c.createGain();o.frequency.value=4300+Math.random()*500;g.gain.value=.0001;
    for(let i=0;i<4;i++){const s=t+i*.035;g.gain.setValueAtTime(.0001,s);g.gain.linearRampToValueAtTime(.012*k,s+.006);g.gain.exponentialRampToValueAtTime(.0001,s+.025)}o.connect(g);g.connect(this.pan());o.start(t);o.stop(t+.2)},
  owl(){const c=this.ctx;for(let i=0;i<2;i++){const t=c.currentTime+.05+i*.55,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(410,t);o.frequency.linearRampToValueAtTime(350,t+.4);this.env(o,g,t,.06,.05,.45);o.connect(g);g.connect(this.pan());o.start(t);o.stop(t+.6)}},
  thunder(delay){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+delay,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.bb;f.type='lowpass';f.frequency.value=160+Math.random()*120;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.55,t+.08);for(let i=1;i<6;i++)g.gain.setTargetAtTime(.15+Math.random()*.35,t+i*.25,.1);g.gain.setTargetAtTime(.0001,t+1.6,.8);s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+5)},
  chime(){if(!this.ctx||!this.on)return;const c=this.ctx;[523.25,659.25,783.99,1046.5,1318.5].forEach((fr,i)=>{const t=c.currentTime+.03+i*.09,o=c.createOscillator(),g=c.createGain();o.type=i%2?'triangle':'sine';o.frequency.value=fr;this.env(o,g,t,.01,.08,1.4);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+1.6)})},
  dust(){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.01,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.nb;f.type='bandpass';f.Q.value=.8;f.frequency.setValueAtTime(600,t);f.frequency.exponentialRampToValueAtTime(5200,t+1.1);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.2,t+.12);g.gain.exponentialRampToValueAtTime(.0001,t+1.5);s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+1.6)},
  miss(){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.01,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(170,t);o.frequency.exponentialRampToValueAtTime(70,t+.25);this.env(o,g,t,.01,.2,.3);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+.4)},
  click(){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.frequency.value=900;this.env(o,g,t,.003,.03,.05);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+.08)},
  choir(dur,tier=1){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.05,out=c.createGain();out.gain.setValueAtTime(.0001,t);out.gain.linearRampToValueAtTime(.15,t+3.2);out.gain.setValueAtTime(.15,t+dur-3);out.gain.linearRampToValueAtTime(.0001,t+dur);
    const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1400;const pk=c.createBiquadFilter();pk.type='peaking';pk.frequency.value=750;pk.gain.value=7;pk.Q.value=1.2;lp.connect(pk);pk.connect(out);out.connect(this.master);
    const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=4.8;lg.gain.value=2.4;lfo.connect(lg);lfo.start(t);lfo.stop(t+dur);
    for(const fr of [146.83,220,293.66,369.99,440,587.33].concat(tier>=2?[739.99]:[],tier>=3?[880,110]:[],tier>=4?[1174.66]:[]))for(const det of [-7,6]){const o=c.createOscillator();o.type='sawtooth';o.frequency.value=fr;o.detune.value=det;lg.connect(o.frequency);const g=c.createGain();g.gain.value=.05;o.connect(g);g.connect(lp);o.start(t);o.stop(t+dur)}
    const notes=[587.33,739.99,880,987.77,1174.66,1479.98];for(let i=0;i<Math.floor(dur/.6);i++){const s=t+1.4+i*.6+Math.random()*.2,o=c.createOscillator(),g=c.createGain();o.frequency.value=notes[Math.floor(Math.random()*notes.length)];this.env(o,g,s,.01,.025,1.8);o.connect(g);g.connect(this.pan());o.start(s);o.stop(s+2)}}
};


/* ================= STORY AUDIO: suspense, impact, sorrow, finale (procedural) ================= */
Object.assign(AU,{
  bus(v){const c=this.ctx,g=c.createGain();g.gain.value=v;g.connect(this.master);return g},
  osc(type,f,dest,t0,t1,det=0){const o=this.ctx.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=det;o.connect(dest);o.start(t0);if(t1)o.stop(t1);return o},
  suspense(dur,vol=1){if(!this.ctx||!this.on)return ()=>{};const c=this.ctx,t=c.currentTime+.05,out=this.bus(0);out.gain.setValueAtTime(.0001,t);out.gain.linearRampToValueAtTime(.16*vol,t+4);out.gain.linearRampToValueAtTime(.26*vol,t+dur*.8);
    const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=260;lp.connect(out);const os=[];
    for(const [f,d] of [[55,-6],[58.3,5],[82.4,0]])os.push(this.osc('sawtooth',f,lp,t,t+dur,d));
    const hi=c.createGain();hi.gain.value=.012*vol;hi.connect(out);for(const f of [622,659,698])os.push(this.osc('sine',f,hi,t,t+dur));
    const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=.15;lg.gain.value=90;lfo.connect(lg);lg.connect(lp.frequency);lfo.start(t);lfo.stop(t+dur);os.push(lfo);
    let beat=0;const hb=setInterval(()=>{if(!this.ctx)return;const s=c.currentTime+.01;for(const dt of [0,.22]){const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(70,s+dt);o.frequency.exponentialRampToValueAtTime(40,s+dt+.15);
      g.gain.setValueAtTime(.0001,s+dt);g.gain.linearRampToValueAtTime(.22*vol*Math.min(1,.3+beat/20),s+dt+.01);g.gain.exponentialRampToValueAtTime(.0001,s+dt+.2);o.connect(g);g.connect(this.master);o.start(s+dt);o.stop(s+dt+.25)}beat++},1050);
    return abrupt=>{clearInterval(hb);const n=c.currentTime;out.gain.cancelScheduledValues(n);out.gain.setValueAtTime(out.gain.value,n);out.gain.linearRampToValueAtTime(.0001,n+(abrupt?.04:1.8));os.forEach(o=>{try{o.stop(n+2)}catch(e){}})}},
  impact(k=1){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.01;const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(62,t);o.frequency.exponentialRampToValueAtTime(24,t+1.6);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.7*k,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+3.2);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+3.3);
    const s=c.createBufferSource(),f=c.createBiquadFilter(),g2=c.createGain();s.buffer=this.bb;f.type='lowpass';f.frequency.value=220;g2.gain.setValueAtTime(.0001,t);g2.gain.linearRampToValueAtTime(.6*k,t+.03);g2.gain.exponentialRampToValueAtTime(.0001,t+4.5);s.connect(f);f.connect(g2);g2.connect(this.master);s.start(t);s.stop(t+4.6)},
  hiss(){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.01,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.nb;f.type='bandpass';f.frequency.value=5200;f.Q.value=1.4;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.07,t+.25);g.gain.setValueAtTime(.07,t+.9);g.gain.exponentialRampToValueAtTime(.0001,t+1.6);s.connect(f);f.connect(g);g.connect(this.pan());s.start(t);s.stop(t+1.7)},
  pluck(){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.01,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.nb;f.type='bandpass';f.frequency.value=1800;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.12,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.18);s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+.2)},
  windUp(){if(!this.ctx)return;this.g(this.wind,.22,2);setTimeout(()=>this.ctx&&this.g(this.wind,.1,4),9000)},
  heart(on){if(this._hb){clearInterval(this._hb);this._hb=null}if(!on||!this.ctx||!this.on)return;const c=this.ctx;let k=0;
    this._hb=setInterval(()=>{const s=c.currentTime+.01;for(const dt of [0,.2]){const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(65,s+dt);o.frequency.exponentialRampToValueAtTime(38,s+dt+.14);
      g.gain.setValueAtTime(.0001,s+dt);g.gain.linearRampToValueAtTime(.3,s+dt+.01);g.gain.exponentialRampToValueAtTime(.0001,s+dt+.2);o.connect(g);g.connect(this.master);o.start(s+dt);o.stop(s+dt+.22)}k++},Math.max(420,800-0))},
  pad(notes,t,dur,vol,out,type='triangle'){const c=this.ctx;const g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+Math.min(2.5,dur*.4));g.gain.setValueAtTime(vol,t+dur*.7);g.gain.linearRampToValueAtTime(.0001,t+dur);g.connect(out);
    for(const f of notes)for(const d of [-5,5]){this.osc(type,f,g,t,t+dur+.1,d)}},
  sad(dur,soft){if(!this.ctx||!this.on)return ()=>{};const c=this.ctx,t=c.currentTime+.05,out=this.bus(.5),lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1500;lp.connect(out);
    const ch=soft?[[220,261.6,329.6],[174.6,220,261.6],[196,246.9,293.7],[220,261.6,329.6]]:[[220,261.6,329.6],[174.6,220,261.6],[164.8,207.7,246.9],[220,261.6,329.6]];const L=dur/ch.length;
    ch.forEach((n,i)=>this.pad(n,t+i*L,L+1,.05,lp));const mel=soft?[659.3,587.3,523.3,587.3,659.3,523.3]:[659.3,587.3,523.3,493.9,440,392,440];
    mel.forEach((f,i)=>{const s=t+1.5+i*(dur-3)/mel.length,o=c.createOscillator(),g=c.createGain();o.frequency.value=f;this.env(o,g,s,.05,.06,2.4);o.connect(g);g.connect(lp);o.start(s);o.stop(s+2.6)});
    return ()=>{const n=c.currentTime;out.gain.setTargetAtTime(.0001,n,.8)}},
  finale(dur){if(!this.ctx||!this.on)return ()=>{};const c=this.ctx,t=c.currentTime+.05,out=this.bus(0),lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(700,t);lp.frequency.linearRampToValueAtTime(2600,t+dur);lp.connect(out);
    out.gain.setValueAtTime(.0001,t);out.gain.linearRampToValueAtTime(.6,t+dur*.85);
    const prog=[[146.8,220,293.7,370],[110,220,277.2,329.6],[123.5,246.9,293.7,370],[98,196,293.7,392],[146.8,220,293.7,370],[110,220,277.2,329.6],[98,196,246.9,392],[146.8,220,293.7,440]];const L=dur/prog.length;
    prog.forEach((n,i)=>{this.pad(n,t+i*L,L+.6,.06,lp,'sawtooth');this.pad([n[0]/2],t+i*L,L+.6,.08,lp,'sine')});
    const mel=[587.3,659.3,740,880,740,659.3,587.3,740,880,987.8,880,740,659.3,587.3];mel.forEach((f,i)=>{const s=t+L*1+i*(dur-L*1.5)/mel.length,o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=f;this.env(o,g,s,.08,.05,1.8);o.connect(g);g.connect(lp);o.start(s);o.stop(s+2)});
    return ()=>{const n=c.currentTime;out.gain.cancelScheduledValues(n);out.gain.setValueAtTime(out.gain.value,n);out.gain.linearRampToValueAtTime(.0001,n+3)}},
  godTone(){if(!this.ctx||!this.on)return;const c=this.ctx,t=c.currentTime+.05,out=this.bus(0);out.gain.setValueAtTime(.0001,t);out.gain.linearRampToValueAtTime(.2,t+3);out.gain.linearRampToValueAtTime(.0001,t+14);
    for(const f of [73.4,110,146.8,220,293.7])for(const d of [-4,4])this.osc('sine',f,out,t,t+14.2,d)},
  crow(){const c=this.ctx;for(let i=0;i<2;i++){const t=c.currentTime+.05+i*.32,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';o.frequency.setValueAtTime(620,t);o.frequency.linearRampToValueAtTime(430,t+.22);
    f.type='bandpass';f.frequency.value=1100;f.Q.value=2;this.env(o,g,t,.02,.04,.24);o.connect(f);f.connect(g);g.connect(this.pan());o.start(t);o.stop(t+.3)}},
  bleat(){const c=this.ctx,t=c.currentTime+.05,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain(),l=c.createOscillator(),lg=c.createGain();o.type='sawtooth';o.frequency.value=330;
    l.frequency.value=7;lg.gain.value=14;l.connect(lg);lg.connect(o.frequency);f.type='bandpass';f.frequency.value=900;f.Q.value=3;this.env(o,g,t,.06,.025,.7);o.connect(f);f.connect(g);g.connect(this.pan());o.start(t);o.stop(t+.8);l.start(t);l.stop(t+.8)},
  lonelyNote(){const c=this.ctx,notes=[220,261.6,293.7,329.6,392,440],f=notes[Math.floor(Math.random()*notes.length)];const t=c.currentTime+.05,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;this.env(o,g,t,.04,.035,3.5);o.connect(g);g.connect(this.pan());o.start(t);o.stop(t+3.8)}
});

/* ================= REGIONS & LEVELS ================= */
const REGIONS=[
 {k:'eden',name:'Jardim do Éden',short:'Éden',from:1,to:3,ic:'tree',p:[.3,.84],desc:'O jardim plantado por Deus, com a Árvore da Vida no meio.'},
 {k:'valley',name:'Vale das Pontes',short:'Vale',from:4,to:6,ic:'bridge',p:[.64,.69],desc:'Um vale verde cortado pelo rio, com pontes de pedra antigas.'},
 {k:'ruins',name:'Santuário Antigo',short:'Santuário',from:7,to:9,ic:'gate',p:[.33,.53],desc:'Floresta escura, colunas caídas e um portão monumental esquecido.'},
 {k:'village',name:'Aldeia de Pedra',short:'Aldeia',from:10,to:12,ic:'house',p:[.66,.37],desc:'Casas de pedra de teto plano entre oliveiras, jarros e carroças.'},
 {k:'hills',name:'Colinas das Oliveiras',short:'Colinas',from:13,to:15,ic:'tower',p:[.35,.21],desc:'Colinas altas, rochedos e uma torre de vigia em ruínas.'},
 {k:'east',name:'Terra a Leste do Éden',short:'Oriente',from:16,to:19,ic:'sun',p:[.63,.07],desc:'O deserto a leste do jardim, com palmeiras, rochas e antigas ruínas.'},
 {k:'fallen',name:'O Jardim Caído',short:'Jardim caído',from:20,to:35,ic:'tree',p:[.12,.62],desc:'Depois da queda: árvores secas, terra rachada e um silêncio pesado.'}];
const LAST=35;
const regionIdx=n=>{for(let i=REGIONS.length-1;i>=0;i--)if(n>=REGIONS[i].from)return i;return 0};
const FALLEN=['F1','F2','F3','F4','F5'];
function sceneFor(n){if(n<=19)return 'L'+String(n).padStart(2,'0');return FALLEN[(n-20)%5]}
function levelCfg(n){const t=clamp((n-4)/15,0,1);let c;
  if(n===1)c={hLo:0,hHi:.4,oLo:0,oHi:.12,an:9,dayLen:240,pool:['clear','clear','broken','mist']};
  else if(n===2)c={hLo:0,hHi:.55,oLo:0,oHi:.25,an:13,dayLen:170,pool:['clear','broken','cloudy','rain','mist']};
  else if(n===3)c={hLo:.08,hHi:.7,oLo:.05,oHi:.4,an:17,dayLen:170,pool:['clear','broken','cloudy','rain','fog','mist']};
  else if(n<20)c={hLo:lerp(.15,.45,t),hHi:lerp(.75,.97,t),oLo:lerp(.12,.3,t),oHi:lerp(.55,.75,t),an:Math.round(16+n*1.1),dayLen:110,pool:['clear','broken','cloudy','rain','fog','storm','mist','fog']};
  else c={hLo:.5,hHi:1,oLo:.35,oHi:.85,an:Math.round(28+(n-20)*.8),dayLen:100,pool:['cloudy','fog','mist','fog','rain','storm','broken'],fogBase:.08};
  c.n=n;c.wander=n>=4;c.wsp=n>=6?.7:.5;c.wDur=n>=4?[14,26]:[24,42];c.startT=n===1?.36:n===2?.62:.18+R()*.6;return c}
/* who must be found */
function cast(n){if(n>=31)return [save.brother||'cain'];if(n===30)return ['abel','cain'];if(n>=26)return ['adam','eve','cain','abel'];if(n>=20)return ['adam','eve'];return save.eve?['adam','eve']:['adam']}
const skinOf=k=>(k==='adam'||k==='eve')&&save.fallen?k+'F':k;
const diffName=n=>n===1?'Fácil':n===2?'Médio':n===3?'Difícil':n<20?'Muito difícil':'Extremo';

/* ================= FLOW ================= */
let state='title',tStart=0,pausedAt=0,penalty=0,misses=0,hintsUsed=0,vt=0,lastTimeTxt='',lastEnvTxt='',lastGot=null,lastTap=null,LV=1,hint=null,parts=[];
const act=k=>actors.find(a=>a.kind===k);
function fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function elapsed(){return((state==='play'?performance.now():pausedAt)-tStart)/1000+penalty}
function toast(m,ms){const t=$('toast');t.textContent=m;t.style.opacity=1;clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.opacity=0,ms||1500)}
function caption(html){const c=$('caption');if(!html){c.style.opacity=0;return}$('capTxt').innerHTML=html;c.style.opacity=1}
function show(id,on){$(id).classList.toggle('hidden',!on)}
function setHUD(on){for(const id of ['hud','ctrlL','ctrlR'])show(id,on)}
function nextVisit(s){return s<5?5:5+Math.ceil((s-4)/10)*10}
function streakTxt(){return LV>=20?'✦ '+save.streak:'✦ '+save.streak+'/'+nextVisit(save.streak)}
function loading(on,txt){let l=$('loading');if(!l){l=document.createElement('div');l.id='loading';document.body.appendChild(l)}l.textContent=txt||'PINTANDO O MUNDO…';l.style.display=on?'flex':'none'}
async function useScene(name){if(!SC[name]||!SC[name].ready)loading(true);const sc=await loadScene(name);loading(false);S=sc;S2=null;G.mix=0;V.g=null;V.s=sMin();V.ox=(S.W-CW/V.s)/2;V.oy=(S.H-CH/V.s)/2;clampView(V);return sc}
function preload(n){if(n<=LAST)loadScene(sceneFor(n)).catch(()=>{});if(n===20)loadScene('E20').catch(()=>{})}
function pickSpot(cfg,avoid,minD=7){const L=S.byH,n=L.length;const a=Math.floor(n*cfg.hLo),b=Math.max(a+1,Math.min(n,Math.floor(n*cfg.hHi)));
  for(let k=0;k<600;k++){const s=L[a+Math.floor(R()*(b-a))];const oc=s[6];const relax=k>300?.2:0;if(oc<cfg.oLo-relax||oc>cfg.oHi+relax)continue;
    const [wx,wz]=spotW(S,s);if(avoid.some(p=>Math.hypot(p[0]-wx,p[1]-wz)<minD))continue;return [wx,wz]}const s=pick(S.spots);return spotW(S,s)}
function placeCast(n,cfg){actors=[];const ks=cast(n),used=[];for(const k of ks){const p=pickSpot(cfg,used,Math.min(12,S.E*.4));used.push(p);
  actors.push(mkActor(k,p[0],p[1],{skin:skinOf(k),sp:cfg.wsp,wander:cfg.wander,face:R()<.5?1:-1}))}}
function setMinis(){const box=$('minis');box.innerHTML='';for(const A of actors){if(A.hideMini)continue;const im=document.createElement('img');im.src=portrait(A.skin);im.alt=NAMES[A.kind];im.id='mini_'+A.kind;
  im.style.cssText='width:40px;height:48px;border-radius:9px;flex:none;border:1px solid var(--line);background:#191812;object-fit:contain';box.appendChild(im)}}
const PORT={};function portrait(skin){if(PORT[skin])return PORT[skin];const c=ATL[skin+'_stand'];if(!c)return '';const cv2=mkC(c.w,c.h);const g=cv2.getContext('2d');
  const gd=g.createRadialGradient(c.w/2,c.h*.4,4,c.w/2,c.h*.4,c.w*.8);gd.addColorStop(0,'#3a3a2a');gd.addColorStop(1,'#141510');g.fillStyle=gd;g.fillRect(0,0,c.w,c.h);
  g.drawImage(c.img,c.x,c.y,c.w,c.h,0,0,c.w,c.h);return PORT[skin]=cv2.toDataURL()}
function introText(n,rg){const names=cast(n).map(k=>NAMES[k]);const list=names.length>1?names.slice(0,-1).join(', ')+' e '+names[names.length-1]:names[0];
  if(n===1)return 'Adão está em algum lugar entre as árvores, o rio e os animais. Arraste para olhar e use dois dedos (ou + e −) para aproximar. Toque nele uma vez para iluminar e de novo para confirmar.';
  if(n<4)return (save.eve?'Encontre Adão e Eva. ':'')+'Mais plantas, mais bichos e o tempo mudando. Olhe com calma: a tanga de folhas some no meio do verde.';
  if(n<20)return (save.eve?'Encontre Adão e Eva. ':'')+rg.desc+' Eles andam pelo lugar, se escondem atrás das folhas, e a noite, a chuva e a neblina atrapalham.';
  if(n<26)return 'O jardim mudou. Encontre '+list+', agora vestidos com túnicas de peles, no meio da terra seca, dos animais fracos e da névoa. Daqui em diante é muito difícil: eles ficam longe, pequenos e escondidos.';
  if(n<30)return 'Encontre os quatro: '+list+'. Caim usa túnica escura; Abel, túnica clara e cajado de pastor.';
  return 'Encontre '+list+'. '+(save.brother==='abel'?'Abel, o pastor de túnica clara, segue sozinho pelo jardim caído.':'Caim, de túnica escura, vaga sozinho pelo jardim caído.')}
async function startLevel(n,showIntro=true){
  if(n===20&&!save.fallen)return storyFall();
  if(n===26&&!save.sons)return storySons();
  if(n===30&&!save.brother)return storyBrothers();
  if(n>=LAST)return storyEnd();
  LV=n;fxAdd=null;fxNorm=null;G.dark=0;G.glowC=[0,0,0];const cfg=levelCfg(n);CFG=cfg;R=Math.random;await useScene(sceneFor(n));show('map',false);
  env.fallK=S.fallen?1:0;placeCast(n,cfg);spawnAnimals(cfg.an,!!S.fallen);
  env.t=cfg.startT;const w0=pick(cfg.pool);env.wt=w0;Object.assign(env,WPRE[w0]);env.wTimer=rnd(cfg.wDur[0],cfg.wDur[1]);env.flash=0;env.vc=0;G.dark=0;G.glowC=[0,0,0];
  penalty=0;misses=0;hintsUsed=0;hint=null;lastGot=null;lastTap=null;setMinis();
  const rg=REGIONS[regionIdx(n)];$('hLvl').textContent='Fase '+n+' · '+rg.short;$('streak').textContent=streakTxt();$('timer').textContent='0:00';
  setHUD(true);show('title',false);show('win',false);preload(n+1);
  if(showIntro){state='intro';$('iSub').textContent=rg.name+' · Fase '+n+' · '+diffName(n);$('iTitle').textContent=n===1?'O Jardim do Éden':rg.name;$('iText').textContent=introText(n,rg);show('intro',true)}
  else{state='play';tStart=performance.now()}}
$('bGo').onclick=()=>{show('intro',false);AU.click();if(state==='missionIntro')return beginMission();state='play';tStart=performance.now()};
function hitActor(A,sx,sy){if(!A.box||!A.a||A.alpha<.3)return false;const [ix,iy]=toImg(sx,sy);const [x0,y0,w,h,fx,fy]=A.box;const tol=Math.max(w*.22,(isTouch?22:15)/V.s);
  return Math.abs(ix-fx)<tol&&iy>y0+h*.08-10/V.s&&iy<fy+10/V.s}
function onTap(sx,sy){if(state==='mission')return missionTap(sx,sy);if(state!=='play')return;const now=performance.now();
  const dbl=lastTap&&now-lastTap.t<420&&Math.hypot(sx-lastTap.x,sy-lastTap.y)<34;lastTap={t:now,x:sx,y:sy};
  for(const A of actors){if(A.got||A.dust||A.hideMini)continue;if(hitActor(A,sx,sy)){lastTap=null;if(A.sel){dustActor(A);return gotActor(A)}return selectActor(A)}}
  if(!dbl){penalty+=1;ripple(sx,sy,true);return}
  lastTap=null;misses++;penalty+=2;save.streak=0;persist();$('streak').textContent=streakTxt();AU.miss();if(navigator.vibrate)try{navigator.vibrate(30)}catch(e){}
  ripple(sx,sy,false);const who=actors.length>1?'Não é nenhum deles':'Não é '+(actors[0].kind==='eve'?'ela':'ele');toast(misses===1?who+' · sequência zerada (+2s)':who+' (+2s)')}
function ripple(sx,sy,soft){const r=document.createElement('div');r.className='ripple'+(soft?' soft':'');r.style.left=sx+'px';r.style.top=sy+'px';document.body.appendChild(r);setTimeout(()=>r.remove(),soft?500:800)}
function selectActor(A){A.sel=true;A.glow=1;A.walk=false;AU.click();toast('Toque de novo em '+NAMES[A.kind]+' para confirmar',2200)}
function gotActor(A){A.got=true;lastGot=A;const m=$('mini_'+A.kind);if(m){m.style.opacity=.35;m.style.filter='grayscale(.8)';m.style.borderColor='var(--gold)'}
  const left=actors.filter(a=>!a.got&&!a.hideMini);if(!left.length)return found();setTimeout(()=>AU.chime(),250);toast('Você achou '+NAMES[A.kind]+'! Falta'+(left.length>1?'m':'')+' '+left.map(a=>NAMES[a.kind]).join(' e ')+'.',2600)}
function dustActor(A){A.dust=1;AU.dust();const s=samp(S,A.x,A.z);if(!s)return;const ppm=s.h/1.75;
  for(let i=0;i<260;i++){const y=s.y-Math.random()*1.75*ppm,x=s.x+(Math.random()-.5)*.45*ppm;parts.push({x,y,vx:(Math.random()-.3)*.9*ppm,vy:-(.3+Math.random()*1.1)*ppm,life:1.6+Math.random()*.9,t:0,r:(.03+Math.random()*.05)*ppm})}}
function updParts(dt){for(const p of parts){p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=dt*8;p.vx*=.99}parts=parts.filter(p=>p.t<p.life);
  for(const A of actors)if(A.dust){A.dust+=dt;A.alpha=Math.max(0,1-(A.dust-1)/.7);A.glow=A.alpha;if(A.alpha<=0)A.a=false}}
function found(){state='found';pausedAt=performance.now();setTimeout(()=>AU.chime(),300);if(misses===0)save.streak++;save.best=Math.max(save.best,LV);persist();$('streak').textContent=streakTxt();
  const A=lastGot||actors[0];const s=samp(S,A.x,A.z);if(s)viewTo(s.x,s.y-.8*s.h,Math.min(sMax(),Math.max(V.s,CH*.18/s.h)),2.5);
  const sk=save.streak,visit=LV<20&&misses===0&&(sk===5||(sk>5&&(sk-5)%10===0)),tier=Math.floor((sk-5)/10)+1;
  setTimeout(()=>{if(state!=='found')return;if(visit)startVisit(tier);else showWin(false)},visit?1500:2200)}
function showWin(visited){state='win';const t=elapsed(),n=LV,th=[25+n*12,70+n*30],st=t<=th[0]?3:t<=th[1]?2:1;
  $('wSub').textContent='Fase '+n+' · '+fmt(t)+(misses?' · '+misses+' erro'+(misses>1?'s':''):' · sem erros');$('wStars').textContent='★'.repeat(st)+'☆'.repeat(3-st);
  const sk=save.streak,nx=nextVisit(sk);const nextReg=n+1<=LAST&&regionIdx(n+1)!==regionIdx(n);let txt;
  if(visited)txt=(V2&&V2.eveArr?'Deus trouxe <b>Eva</b> ao jardim! A partir de agora, cada fase pede para achar <b>Adão e Eva</b>. ':V2&&V2.tier>1?'Os céus se abriram mais uma vez. ':'Deus visitou o jardim e Adão se prostrou diante dele. ')+'Sequência atual: <b>✦ '+sk+'</b>.'+(sk+10<=nextVisit(sk)+10&&n<19?' A próxima visita vem no '+(sk+10)+'º acerto seguido.':'');
  else if(n>=20)txt=(misses?'Você errou nesta fase. ':'Sem erros! ')+'Sequência: <b>✦ '+sk+'</b>.'+(n===25?'<br><br>O tempo vai passar no jardim…':n===29?'<br><br>Algo vai acontecer entre os irmãos…':n===LAST-1?'<br><br>Chegou a hora de deixar o jardim.':'');
  else txt=(misses?'Você errou nesta fase, então a sequência recomeçou. ':'Sem erros! ')+'Sequência: <b>✦ '+sk+'</b>. Faltam '+(nx-sk)+' acerto'+(nx-sk>1?'s':'')+' seguidos para Deus visitar o jardim.';
  if(n===19)txt+='<br><br>🐍 A próxima fase leva você de volta ao Éden. Algo vai mudar para sempre.';
  $('wText').innerHTML=txt+(nextReg&&n!==19?'<br><br>🗺️ <b>Nova região liberada:</b> '+REGIONS[regionIdx(n+1)].name+'.':'');
  $('wNext').textContent=n>=LAST-1||n===19?'Continuar':nextReg?'Ver o mapa':'Próxima fase';save.level=n+1;persist();show('win',true)}
$('wNext').onclick=()=>{AU.click();show('win',false);const n=save.level;if(n>=20||regionIdx(n)===regionIdx(n-1))startLevel(n);else openMap()};
$('wMenu').onclick=()=>{AU.click();goTitle()};$('bMenu').onclick=()=>{AU.click();goTitle()};

/* ---------------- hint ---------------- */
$('bHint').onclick=()=>{if(state!=='play')return;AU.click();if(hintsUsed>=2){toast('Sem mais dicas nesta fase');return}
  hintsUsed++;penalty+=20;const tg=actors.find(a=>!a.got&&!a.hideMini)||actors[0];const r=hintsUsed===1?9:4.5,o=r*.5,a=R()*TAU;let hx=tg.x+Math.cos(a)*o*R(),hz=tg.z+Math.sin(a)*o*R();if(!samp(S,hx,hz)){hx=tg.x;hz=tg.z}
  hint={x:hx,z:hz,r,t:0};const s=samp(S,hx,hz);if(s)viewTo(s.x,s.y,Math.max(V.s,CH/(r*2.6*s.h/1.75)),3);toast('Dica: '+NAMES[tg.kind]+' está dentro do círculo (+20s)',2200)};
$('bMute').onclick=()=>{save.sound=!save.sound;persist();AU.set(save.sound);syncSoundBtns()};
function syncSoundBtns(){$('bMute').textContent=save.sound?'🔊':'🔇';$('bSound').textContent=(save.sound?'🔊 Som: ligado':'🔇 Som: desligado')}

/* ---------------- divine visit (levels 1–19) ---------------- */
let V2=null;
function startVisit(tier){state='visit';vt=0;save.visits++;persist();const A=act('adam');
  let g=[A.x+2.6,A.z];for(const [dx,dz] of [[2.6,0],[-2.6,0],[0,2.6],[0,-2.6],[1.8,1.8],[-1.8,1.8]])if(walkable(S,A.x+dx,A.z+dz)){g=[A.x+dx,A.z+dz];break}
  V2={tier,eveArr:tier>=2&&!save.eve,gx:g[0],gz:g[1],t0:env.t};V2.off=V2.eveArr?3.4:tier>=3?1:0;
  for(const B of actors){B.sel=false;B.glow=0;B.walk=false;B.wander=false;B.dust=0;B.alpha=1;B.a=true}
  const s=samp(S,(A.x+g[0])/2,(A.z+g[1])/2)||samp(S,A.x,A.z);viewTo(s.x,s.y-1.6*s.h/1.75,CH*.2/s.h,1.6);AU.choir(15+V2.off,tier);
  if(V2.eveArr){const e=mkActor('eve',g[0],g[1],{skin:'eve',sp:.8});e.alpha=0;e.noShadow=true;actors.push(e);let ep=[A.x+1,A.z];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(walkable(S,A.x+dx,A.z+dz)){ep=[A.x+dx,A.z+dz];break}V2.ev=ep}
  fxAdd=visitFxAdd;fxNorm=visitFxNorm}
function updateVisit(dt){vt+=dt;const o=V2.off,T=V2.tier,A=act('adam');
  {const d=((.77-V2.t0+1.5)%1)-.5;env.t=(V2.t0+d*smooth(.2,4.5,vt)+1)%1}
  const up=smooth(1.2,3.6,vt)*(1-smooth(11+o,13.8+o,vt));V2.up=up;V2.op=smooth(1.6,3.4,vt)*(1-smooth(11.4+o,13.4+o,vt));V2.inK=smooth(2,4.5,vt)*(1-smooth(11.2+o,13.6+o,vt));
  env.vc=up;const gs_=samp(S,V2.gx,V2.gz);if(gs_){const ppm=gs_.h/1.75;G.glowP=[gs_.x,gs_.y-1.4*ppm,6*ppm];G.glowC=[.3*up,.23*up,.12*up];G.dark=.4*up}
  $('flash').style.opacity=vt<2.6?smooth(.8,2.6,vt)*.3:lerp(.3,0,smooth(2.6,4.6,vt))*(1-smooth(10.5+o,13.5+o,vt));
  const gsx=gs_?gs_.x:0,face=s=>s&&gs_?(gs_.x>s.x?1:-1):1;
  A.face=face(samp(S,A.x,A.z));A.pose=vt>4.6&&vt<9.8?'pray':null;
  const E=act('eve');if(E&&!V2.eveArr){E.face=face(samp(S,E.x,E.z));E.pose=A.pose}
  if(V2.eveArr&&E){if(vt>9.9){E.alpha=smooth(9.9,10.8,vt);E.noShadow=false}if(vt>10.9&&!E.walk&&!V2.ew){V2.ew=1;goTo(E,V2.ev[0],V2.ev[1])}if(vt>12.8){E.walk=false;E.face=face(samp(S,E.x,E.z))*-1}}
  if(T>=5)G.night=Math.max(G.night,V2.inK*.45);
  const both=E&&!V2.eveArr;
  const intro=T>=5?'Coros de anjos enchem o céu do Éden':T>=4?'Pombas descem com a luz sobre o jardim':T>=3?'Os céus se abrem sobre o jardim':T>=2?'Anjos descem junto com a luz':'Uma luz forte desce dos céus…';
  if(vt<1.8)caption('');else if(vt<4.6)caption(intro);
  else if(vt<9.8)caption((both?'Deus visita Adão e Eva':'Deus visita Adão')+'<small>'+(both?'Adão e Eva se prostram e oram':'Adão se prostra e ora')+' · '+Math.ceil(9.8-vt)+'</small>');
  else if(V2.eveArr&&vt<11.6)caption('Deus traz Eva ao jardim<small>GÊNESIS 2:22</small>');
  else if(V2.eveArr&&vt<13.2)caption('“Esta é agora osso dos meus ossos”<small>GÊNESIS 2:23</small>');
  else if(vt<13+o)caption('“Deus passeava no jardim pela viração do dia”<small>GÊNESIS 3:8</small>');else caption('');
  if(vt>14.4+o){fxAdd=null;fxNorm=null;G.dark=0;G.glowC=[0,0,0];env.vc=0;$('flash').style.opacity=0;caption('');A.pose=null;if(E)E.pose=null;if(V2.eveArr){save.eve=true;persist()}showWin(true)}}
function visitFxAdd(){const gs_=samp(S,V2.gx,V2.gz);if(!gs_)return;const ppm=gs_.h/1.75,T=V2.tier,o=V2.off,up=V2.up,op=V2.op,inK=V2.inK;
  const top=V.oy-50,cw=3.2*ppm;rect(gs_.x-cw*.35,top,cw*.7,gs_.y-top,FX.ray.uv,0,up*.3,0,0);rect(gs_.x-cw,top,cw*2,gs_.y-top,FX.ray.uv,0,up*.1,0,0);
  rect(gs_.x-4*ppm,gs_.y-1*ppm,8*ppm,2*ppm,FX.glow.uv,0,up*.3,0,0);
  const fs=1+Math.min(T-1,4)*.08,gh=2.5*ppm*fs,gw=gh*.5;const yoff=(lerp(16,0,smooth(1.6,4.6,vt))+smooth(10.8+o,13.6+o,vt)*18)*ppm;
  if(T>=3)rect(gs_.x-2.4*ppm,gs_.y-gh*.62-2.4*ppm-yoff,4.8*ppm,4.8*ppm,FX.rays.uv,0,op*.5,0,0,TT*.05);
  rect(gs_.x-2.2*ppm,gs_.y-gh*.75-2.2*ppm-yoff,4.4*ppm,4.4*ppm,FX.glow.uv,0,op*.28,0,0);
  rect(gs_.x-gw/2,gs_.y-gh-yoff,gw,gh,FX.god.uv,0,op*.95,0,0);
  for(let i=0;i<40;i++){const ph=(i*.137+TT*.12*(.5+(i%5)*.15))%1;const x=gs_.x+Math.sin(i*2.1+TT*.4)*2.2*ppm,y=gs_.y-ph*5*ppm,r=.08*ppm;rect(x-r,y-r,2*r,2*r,FX.spark.uv,0,up*(1-ph)*.9,0,0)}
  const nA=T>=5?13:T>=4?10:T>=3?7:T>=2?4:0;const A=act('adam'),cx=(A.x+V2.gx)/2,cz=(A.z+V2.gz)/2;
  const ms=samp(S,cx,cz)||gs_;for(let i=0;i<nA;i++){const ph=i/nA*TAU+TT*.08*(i%2?1:-1),r=3.2+(i%3)*1.1;const p2=ms.h/1.75;const s={x:ms.x+Math.cos(ph)*r*p2,y:ms.y+Math.sin(ph)*r*p2*.35};
    const desc=smooth(2+i*.15,5.5+i*.15,vt),asc=smooth(10.8+o+i*.06,13.6+o,vt);const hh=(1.8+(i%3)*1.0+Math.sin(TT*1.1+i)*.2+lerp(14,0,desc)+asc*16)*p2;const sz=1.9*p2;
    rect(s.x-sz/2,s.y-hh-sz*.85,sz,sz,FX.angel.uv,0,inK*.8,0,0,Math.sin(TT*.8+i)*.04);rect(s.x-sz*.8,s.y-hh-sz*1.1,sz*1.6,sz*1.6,FX.glow.uv,0,inK*.3,0,0)}
  if(V2.eveArr){const E=act('eve');const es=E&&samp(S,E.x,E.z);const g=Math.exp(-Math.pow((vt-10.3)/.55,2));if(es){const p=es.h/1.75;rect(es.x-2*p,es.y-3.2*p,4*p,4*p,FX.glow.uv,0,g*.9,0,0)}}}
function visitFxNorm(){if(V2.tier<4)return;const gs_=samp(S,V2.gx,V2.gz);if(!gs_)return;const ppm=gs_.h/1.75,inK=V2.inK;
  const vw=CW/V.s;rect(V.ox+vw*.05,V.oy+CH/V.s*.02,vw*.9,vw*.45,FX.rainbow.uv,0,inK*.35,0,0);
  for(let i=0;i<14;i++){const a=TT*(.5+(i%3)*.12)*(i%2?1:-1)+i,r=(2.4+(i%4)*1.1)*ppm;const fl=Math.abs(Math.sin(TT*10+i));const w=.55*ppm,h=w*(.4+.6*fl);
    rect(gs_.x+Math.cos(a)*r-w/2,gs_.y-(4+(i%5)*.6)*ppm+Math.sin(a)*r*.25,w,h,FX.dove.uv,0,inK,0,0,0,Math.sin(a)>0)}}

/* ---------------- title ---------------- */
async function goTitle(){state='title';setHUD(false);for(const id of ['intro','win','map','ending'])show(id,false);show('title',true);caption('');$('flash').style.opacity=0;fxAdd=null;fxNorm=null;G.dark=0;G.glowC=[0,0,0];env.vc=0;
  $('bars').classList.remove('on');$('fade').style.opacity=0;show('skip',false);show('cd',false);
  $('bPlay').textContent=save.ended?'Jogar de novo':save.level>1?'Continuar · Fase '+save.level:'Começar';
  $('stats').textContent='Fase mais alta: '+save.best+'  ·  Sequência: ✦ '+save.streak+'  ·  Visitas divinas: '+save.visits;
  const ks=save.level>=26&&save.sons?['adam','eve','cain','abel']:save.eve||save.level>=20?['adam','eve']:['adam'];
  $('pics').innerHTML='';for(const k of ks){const im=document.createElement('img');im.src=portrait(skinOf(k));im.alt=NAMES[k];$('pics').appendChild(im)}
  $('wantedTxt').innerHTML=save.level>=26&&save.sons?'Encontre <b>Adão</b>, <b>Eva</b>, <b>Caim</b> (túnica escura) e <b>Abel</b> (túnica clara e cajado).':save.fallen?'Encontre <b>Adão</b> e <b>Eva</b>, agora com túnicas de peles, no jardim caído.':save.eve?'Encontre <b>Adão</b> (sem camisa, tanga de folhas, barba) e <b>Eva</b> (vestido de folhas, cabelo longo e uma flor no cabelo).':'Encontre <b>Adão</b>: <b>sem camisa</b>, de <b>tanga de folhas</b>, cabelo e barba castanhos.';
  const n=Math.min(save.level,LAST);CFG=levelCfg(n);await useScene(n===20&&!save.fallen?'L03':sceneFor(n));actors=[];spawnAnimals(14,!!S.fallen);env.fallK=S.fallen?1:0;env.t=.42;Object.assign(env,WPRE.clear);env.wt='clear';env.wTimer=1e9;
  V.s=sMin()*1.15;V.ox=(S.W-CW/V.s)/2;clampView(V);V.titleDir=1}
$('bPlay').onclick=()=>{AU.init();AU.set(save.sound);if(save.ended){resetAll();}openMap()};
$('bMap').onclick=()=>{AU.init();AU.set(save.sound);openMap()};
function resetAll(){Object.assign(save,{level:1,streak:0,eve:false,seenRegion:0,fallen:false,sons:false,brother:null,ended:false});persist()}
$('bReset').onclick=()=>{resetAll();AU.init();AU.set(save.sound);openMap()};
$('bSound').onclick=()=>{save.sound=!save.sound;persist();syncSoundBtns();if(AU.ctx)AU.set(save.sound)};
$('bQual').textContent='Qualidade: '+save.quality;
$('bQual').onclick=()=>{save.quality=save.quality==='alta'?'leve':'alta';persist();location.reload()};

function paintMapBase(w,h){const c=mkC(w,h),g=c.getContext('2d');const r=rng(7);
  g.fillStyle='#d6c49c';g.fillRect(0,0,w,h);const im=g.getImageData(0,0,w,h),d=im.data;
  for(let y=0;y<h;y+=1)for(let x=0;x<w;x+=1){const o=(y*w+x)*4,n=fbm(x/w*6,y/h*6,6,6,4),s=noise(x*.5,y*.5,256,256);const k=.82+.25*n+.05*(s-.5);d[o]*=k;d[o+1]*=k;d[o+2]*=k*.97}g.putImageData(im,0,0);
  const P=(x,y)=>[x*w,y*h];
  /* desert tint to the east (top) */
  let gd=g.createLinearGradient(0,0,0,h*.3);gd.addColorStop(0,'rgba(200,160,90,.35)');gd.addColorStop(1,'rgba(200,160,90,0)');g.fillStyle=gd;g.fillRect(0,0,w,h*.3);
  /* river */
  g.lineCap='round';g.lineJoin='round';const river=[[.95,.02],[.8,.18],[.5,.3],[.2,.42],[.48,.58],[.82,.62],[.55,.8],[.15,.92],[.05,1]];
  for(const [lw,col] of [[w*.03,'rgba(70,90,92,.35)'],[w*.018,'#6f8c8e'],[w*.007,'rgba(200,220,215,.35)']]){g.strokeStyle=col;g.lineWidth=lw;g.beginPath();g.moveTo(...P(...river[0]));for(let i=1;i<river.length-1;i++){const a=P(...river[i]),b=P(...river[i+1]);g.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2)}g.stroke()}
  /* hills */
  g.strokeStyle='rgba(92,66,38,.55)';g.lineWidth=w*.0035;for(let i=0;i<70;i++){const x=r()*w,y=r()*h*.85;const s=w*(.018+r()*.03);if(Math.abs(x-w*.5)<w*.1&&r()<.6)continue;g.beginPath();g.moveTo(x-s,y);g.quadraticCurveTo(x-s*.3,y-s*.9,x,y-s*.5);g.quadraticCurveTo(x+s*.3,y-s*.9,x+s,y);g.stroke()}
  /* forests */
  for(let i=0;i<520;i++){const x=r()*w,y=h*.12+r()*h*.86;const s=w*(.007+r()*.006);if(y<h*.2&&r()<.8)continue;g.fillStyle=`rgba(${60+r()*20},${82+r()*20},${44+r()*10},.75)`;g.beginPath();g.arc(x,y-s,s,0,TAU);g.fill();g.fillStyle='rgba(70,48,28,.6)';g.fillRect(x-s*.15,y-s*.2,s*.3,s*.6)}
  /* road */
  g.setLineDash([w*.012,w*.01]);g.strokeStyle='rgba(110,70,36,.85)';g.lineWidth=w*.006;g.beginPath();REGIONS.forEach((rg,i)=>{const p=P(...rg.p);if(!i)g.moveTo(...p);else{const q=P(...REGIONS[i-1].p);g.quadraticCurveTo((q[0]+p[0])/2+(i%2?-1:1)*w*.08,(q[1]+p[1])/2,p[0],p[1])}});g.stroke();g.setLineDash([]);
  /* compass */
  {const cx=w*.86,cy=h*.9,s=w*.05;g.strokeStyle='rgba(80,52,30,.8)';g.fillStyle='rgba(80,52,30,.8)';g.lineWidth=1.5;for(let k=0;k<4;k++){g.save();g.translate(cx,cy);g.rotate(k*Math.PI/2);g.beginPath();g.moveTo(0,-s);g.lineTo(s*.18,0);g.lineTo(-s*.18,0);g.closePath();g.fill();g.restore()}
    g.font=`${Math.round(w*.025)}px Georgia,serif`;g.textAlign='center';g.fillText('L',cx,cy-s-w*.008)}
  /* burnt edges */
  gd=g.createRadialGradient(w/2,h/2,Math.min(w,h)*.35,w/2,h/2,Math.max(w,h)*.72);gd.addColorStop(0,'rgba(90,60,30,0)');gd.addColorStop(1,'rgba(70,44,20,.75)');g.fillStyle=gd;g.fillRect(0,0,w,h);
  return c}
function drawIcon(g,k,x,y,s){g.save();g.translate(x,y);g.strokeStyle='#3e2a18';g.fillStyle='#3e2a18';g.lineWidth=Math.max(1.5,s*.06);g.lineCap='round';
  if(k==='tree'){g.beginPath();g.ellipse(0,s*.45,s*.9,s*.25,0,0,TAU);g.stroke();g.fillRect(-s*.08,-s*.1,s*.16,s*.55);g.beginPath();g.arc(0,-s*.35,s*.5,0,TAU);g.fillStyle='rgba(60,80,40,.9)';g.fill();g.stroke()}
  else if(k==='bridge'){g.beginPath();g.moveTo(-s,s*.2);g.quadraticCurveTo(0,-s*.55,s,s*.2);g.stroke();g.beginPath();g.arc(0,s*.35,s*.42,Math.PI,0);g.stroke();g.beginPath();g.moveTo(-s,s*.35);g.lineTo(s,s*.35);g.stroke()}
  else if(k==='gate'){g.strokeRect(-s*.7,-s*.6,s*.35,s*1.1);g.strokeRect(s*.35,-s*.6,s*.35,s*1.1);g.beginPath();g.arc(0,-s*.15,s*.35,Math.PI,0);g.stroke();g.beginPath();g.moveTo(-s*.8,-s*.65);g.lineTo(s*.8,-s*.65);g.stroke()}
  else if(k==='house'){for(const [dx,dy,ww] of [[-s*.5,0,s*.7],[s*.25,-s*.2,s*.6]]){g.strokeRect(dx-ww/2,dy-ww*.35,ww,ww*.7);g.fillRect(dx-ww*.1,dy,ww*.2,ww*.35)}}
  else if(k==='tower'){g.strokeRect(-s*.3,-s*.6,s*.6,s*1.2);for(let i=-1;i<=1;i++)g.fillRect(i*s*.2-s*.06,-s*.75,s*.12,s*.15);g.fillRect(-s*.08,s*.25,s*.16,s*.35)}
  else if(k==='sun'){g.beginPath();g.arc(0,0,s*.35,0,TAU);g.stroke();for(let i=0;i<12;i++){const a=i/12*TAU;g.beginPath();g.moveTo(Math.cos(a)*s*.5,Math.sin(a)*s*.5);g.lineTo(Math.cos(a)*s*.8,Math.sin(a)*s*.8);g.stroke()}}
  g.restore()}
function drawMap(){const cvs=$('mapCv'),dpr=Math.min(window.devicePixelRatio||1,2);const W0=cvs.clientWidth,H0=cvs.clientHeight;if(!W0||!H0)return;
  if(cvs.width!==Math.round(W0*dpr)||cvs.height!==Math.round(H0*dpr)){cvs.width=Math.round(W0*dpr);cvs.height=Math.round(H0*dpr)}
  const g=cvs.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#120e09';g.fillRect(0,0,W0,H0);
  const ar=.78;let w=Math.min(W0,H0*ar),h=w/ar;if(h>H0){h=H0;w=h*ar}const ox=(W0-w)/2,oy=(H0-h)/2;
  if(!mapBase||mapBase.width!==Math.round(w*dpr)){mapBase=paintMapBase(Math.round(w*dpr),Math.round(h*dpr))}
  g.drawImage(mapBase,ox,oy,w,h);
  const cur=regionIdx(save.level);const fs=Math.max(11,w*.032);
  REGIONS.forEach((rg,i)=>{const x=ox+rg.p[0]*w,y=oy+rg.p[1]*h,s=w*.045;const locked=i>cur;
    drawIcon(g,rg.ic,x,y,s);
    g.font=`${Math.round(fs)}px "Iowan Old Style",Palatino,Georgia,serif`;g.textAlign='center';g.fillStyle=locked?'rgba(60,40,24,.45)':'#2e1e10';g.fillText(rg.name,x,y+s*1.55);
    g.font=`italic ${Math.round(fs*.78)}px Georgia,serif`;g.fillStyle=locked?'rgba(60,40,24,.4)':'rgba(60,40,24,.85)';g.fillText(rg.to>1e8?'Fases '+rg.from+'+':'Fases '+rg.from+'–'+rg.to,x,y+s*1.55+fs*1.05);
    const fogK=locked?1:(i===cur&&mapUnlockT>=0?1-mapUnlockT:0);
    if(fogK>0){for(let k=0;k<5;k++){const fx=x+Math.sin(k*2.1+mapAnim*.3)*s*.9,fy=y+Math.cos(k*1.7+mapAnim*.25)*s*.5;const gd=g.createRadialGradient(fx,fy,0,fx,fy,s*2.4);
      gd.addColorStop(0,`rgba(232,226,212,${.55*fogK})`);gd.addColorStop(1,'rgba(232,226,212,0)');g.fillStyle=gd;g.fillRect(fx-s*2.5,fy-s*2.5,s*5,s*5)}
      if(locked){g.font=`${Math.round(fs*1.2)}px Georgia,serif`;g.fillStyle='rgba(70,50,30,.75)';g.fillText('?',x,y-s*.9)}}
    if(i===cur){const pr=1+Math.sin(mapAnim*3)*.08;g.strokeStyle='rgba(176,128,40,.95)';g.lineWidth=2.5;g.beginPath();g.arc(x,y,s*1.15*pr,0,TAU);g.stroke();
      const gd=g.createRadialGradient(x,y,0,x,y,s*2.2);gd.addColorStop(0,'rgba(255,214,130,.35)');gd.addColorStop(1,'rgba(255,214,130,0)');g.fillStyle=gd;g.fillRect(x-s*2.2,y-s*2.2,s*4.4,s*4.4)}});
  g.font=`${Math.round(fs*1.2)}px "Iowan Old Style",Palatino,Georgia,serif`;g.textAlign='center';g.fillStyle='rgba(46,30,16,.9)';g.fillText('O MUNDO DE ONDE VOCÊ ESTÁ?',ox+w/2,oy+h*.035+fs)}

/* ================= WORLD MAP ================= */
let mapAnim=0,mapUnlockT=-1,mapRAF=0,mapBase=null;
function openMap(){state='map';setHUD(false);for(const id of ['title','win','intro'])show(id,false);show('map',true);
  const n=Math.min(save.level,LAST),ri=regionIdx(n);$('mapReg').textContent=REGIONS[ri].name;$('mapDesc').textContent=REGIONS[ri].desc;$('mapGo').textContent=n===20&&!save.fallen?'Entrar · Fase 20 (cena)':'Entrar · Fase '+n;
  mapUnlockT=ri>save.seenRegion?0:-1;if(mapUnlockT===0)setTimeout(()=>toast('Nova região liberada: '+REGIONS[ri].name,2600),600);
  save.seenRegion=Math.max(save.seenRegion,ri);persist();cancelAnimationFrame(mapRAF);const t0=performance.now();preload(n);
  const tick=now=>{mapAnim=(now-t0)/1000;if(mapUnlockT>=0)mapUnlockT=Math.min(1,mapAnim/2.2);drawMap();if(state==='map')mapRAF=requestAnimationFrame(tick)};mapRAF=requestAnimationFrame(tick)}
$('mapGo').onclick=()=>{AU.click();startLevel(Math.min(save.level,LAST+1))};$('mapBack').onclick=()=>{AU.click();goTitle()};

/* ================= CINEMATIC STORY (levels 20–35) ================= */
let CS=null,MS=null;
function csStart(){CS={skip:false};state='cut';setHUD(false);for(const id of ['intro','win','map','title'])show(id,false);$('bars').classList.add('on');show('skip',true);fxAdd=null;fxNorm=null;V.g=null}
function csEnd(){CS=null;$('bars').classList.remove('on');show('skip',false);caption('');G.dark=0;G.glowC=[0,0,0];fxAdd=null;fxNorm=null}
$('skip').onclick=()=>{if(CS){CS.skip=true;if(window.speechSynthesis)try{speechSynthesis.cancel()}catch(e){}}};
const wait=s=>new Promise(r=>{const t0=TT;const f=()=>{if(!CS||CS.skip||TT-t0>=s){if(window.DBG)console.log("wait",s,!!CS,CS&&CS.skip,TT-t0);r()}else requestAnimationFrame(f)};f()});
async function say(html,s){caption(html);await wait(s)}
function fade(on){$('fade').style.opacity=on?1:0}
function focusOn(A,hFrac,spd,dy=.9){const s=samp(S,A.x,A.z);if(s)viewTo(s.x,s.y-dy*s.h,CH*hFrac*.6/s.h,spd||1.4)}
function focusMid(L,hFrac,spd){let x=0,y=0,h=0,n=0;for(const A of L){const s=samp(S,A.x,A.z);if(s){x+=s.x;y+=s.y;h+=s.h;n++}}if(n)viewTo(x/n,y/n-.9*h/n,CH*hFrac*.6/(h/n),spd||1.2)}
async function walkTo(A,x,z,max=9){if(!walkable(S,x,z)){const p=nearW(x,z);x=p[0];z=p[1]}goTo(A,x,z);const t0=TT;while(A.walk&&TT-t0<max&&CS&&!CS.skip)await wait(.1);if(!CS||CS.skip){A.x=x;A.z=z;A.walk=false}}
function nearW(x,z){let best=[x,z],bd=1e9;for(const s of S.spots){const [wx,wz]=spotW(S,s);const d=Math.hypot(wx-x,wz-z);if(d<bd){bd=d;best=[wx,wz]}}return best}
function faceTo(A,B){const a=samp(S,A.x,A.z),b=samp(S,B.x,B.z);if(a&&b)A.face=b.x>a.x?1:-1}
async function tween(dur,fn){const t0=TT;while(CS&&!CS.skip&&TT-t0<dur){fn(clamp((TT-t0)/dur,0,1));await wait(.03)}fn(1)}
function speak(text,pitch=.35,rate=.82){if(!save.sound||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='pt-BR';u.pitch=pitch;u.rate=rate;u.volume=1;
  const v=speechSynthesis.getVoices().filter(v=>/pt/i.test(v.lang));if(v.length)u.voice=v.find(x=>/BR/i.test(x.lang))||v[0];speechSynthesis.speak(u)}catch(e){}}
function placeAround(cfg,n,minD){const out=[];for(let i=0;i<n;i++)out.push(pickSpot(cfg,out,minD));return out}
function areaOcc(s,r=3){let t=0,c=0;for(let di=-r;di<=r;di++)for(let dj=-r;dj<=r;dj++){const q=gs(S,s[0]+di,s[1]+dj);if(q){t+=q[6];c++}else{t+=.5;c++}}return t/c}
function centerSpot(){const L=S.byH,n=L.length;let best=null,bd=1e9;for(let i=Math.floor(n*.15);i<Math.floor(n*.6);i+=2){const s=L[i];if(s[6]>.15)continue;const d=Math.abs(s[2]-S.W/2)/S.W+Math.abs(s[3]-S.H*.6)/S.H*.6+areaOcc(s)*2.2;if(d<bd){bd=d;best=s}}return spotW(S,best||L[Math.floor(n/3)])}

/* ---------- LEVEL 20: the temptation and the fall ---------- */
async function storyFall(){LV=20;CFG=levelCfg(20);save.eve=true;persist();csStart();fade(true);AU.init();
  const E=await useScene('E20');const pF=loadScene('F1');env.fallK=0;env.t=.64;env.wt='broken';Object.assign(env,WPRE.broken);env.wTimer=1e9;
  spawnAnimals(16,false);for(const a of animals)a.wander=true;
  const L=S.life||[S.W/2,S.H*.45];let ts=nearestSpot(S,L[0],L[1]+S.H*.06,s=>s[3]>L[1]&&s[6]<.6)||S.spots[0];const [tx,tz]=spotW(S,ts);
  const serp=mkActor('serpent',tx-.5,tz,{noShadow:true});serp.cellOv=ATL.serpent;serp.scale=.95;
  const eve=mkActor('eve',...nearW(tx+6,tz+3),{skin:'eve',sp:.8});const adam=mkActor('adam',...nearW(tx+9,tz-4),{skin:'adam',sp:.9});actors=[serp,eve,adam];
  const ts_=samp(S,tx,tz);V.s=clamp(CH*.16/ts_.h,sMin(),sMax());V.ox=ts_.x-CW/V.s/2;V.oy=ts_.y-ts_.h*1.6-CH/V.s/2;clampView(V);
  const stopS=AU.suspense(70);fxAdd=()=>{const s=samp(S,serp.x,serp.z);if(s&&serp.alpha>.05){const p=s.h/1.75;rect(s.x-1.4*p,s.y-1.8*p,2.8*p,2.4*p,FX.glow.uv,0,.07*serp.alpha,0,0)}serp.rot=Math.sin(TT*1.3)*.05};
  await wait(.6);fade(false);
  await say('No meio do jardim estava a árvore do conhecimento do bem e do mal.<small>GÊNESIS 2:9</small>',4);
  focusOn(eve,.3,1);await walkTo(eve,tx+1.2,tz+.2,9);faceTo(eve,serp);eve.pose='look';
  focusMid([eve,serp],.4,1);AU.hiss();await say('<b>Serpente:</b> “É assim que Deus disse: Não comereis de toda árvore do jardim?”<small>GÊNESIS 3:1</small>',5.5);
  focusOn(eve,.62,1.2,1.35);eve.pose=null;await say('<b>Eva:</b> “Do fruto da árvore que está no meio do jardim, disse Deus: não comereis dele, para que não morrais.”<small>GÊNESIS 3:3</small>',6);
  focusOn(serp,.5,1.2,.6);AU.hiss();await say('<b>Serpente:</b> “Certamente não morrereis… sereis como Deus, sabendo o bem e o mal.”<small>GÊNESIS 3:4-5</small>',6);
  focusOn(eve,.85,.9,1.45);eve.pose='look';await say('Eva olha para o fruto… e hesita.',4.2);
  eve.pose='offer';AU.pluck();await say('“…tomou do seu fruto.”<small>GÊNESIS 3:6</small>',3.4);
  eve.pose=null;faceTo(eve,adam);focusMid([eve,adam],.22,1);await say('<b>Eva:</b> “Adão!”',2.2);
  await walkTo(adam,tx+2.4,tz+.3,10);faceTo(adam,eve);faceTo(eve,adam);eve.pose='offer';focusMid([eve,adam],.42,1.2);
  await say('Ela oferece o fruto a Adão.',3.6);
  adam.pose='look';focusOn(adam,.85,.9,1.45);await say('Adão hesita… e olha para Eva.',4.2);
  adam.pose='eat';eve.pose=null;focusMid([eve,adam],.5,1.5);await say('“…e deu também a seu marido, e ele comeu com ela.”<small>GÊNESIS 3:6</small>',2.8);
  stopS(true);AU.impact();G.flash=.0;$('flash').style.opacity=.65;setTimeout(()=>$('flash').style.opacity=0,180);G.dark=.55;caption('');await wait(2);
  /* the garden withers in front of the player */
  S2=await pF;G.mixC=[ts_.x,ts_.y];focusMid([eve,adam],.16,.5);AU.windUp();env.wt='fog';
  caption('“Então foram abertos os olhos de ambos…”<small>GÊNESIS 3:7</small>');
  await tween(9,k=>{G.mix=k;env.fallK=k;G.dark=.55*(1-k)+.12*k;Object.assign(env,{cloud:lerp(.5,.9,k),fog:lerp(.12,.3,k)});serp.alpha=1-smooth(.5,.9,k);
    for(let i=0;i<animals.length;i++){const a=animals[i];if(k>(i+1)/(animals.length+2)){a.thin=true;if(i%3===0){a.lying=true;a.walk=false;a.wander=false}}}});
  S=S2;S2=null;G.mix=0;actors=[eve,adam];adam.pose=null;eve.pose=null;
  focusMid([eve,adam],.38,1);await say('“E fez o Senhor Deus a Adão e à sua mulher túnicas de peles, e os vestiu.”<small>GÊNESIS 3:21</small>',2.5);
  adam.glow=eve.glow=1;await wait(.8);adam.skin='adamF';eve.skin='eveF';await wait(.8);adam.glow=eve.glow=0;await wait(2.5);
  save.fallen=true;save.level=20;persist();fade(true);await wait(1.6);csEnd();await startLevel(20);fade(false)}

/* ---------- LEVEL 26: time passes, Cain and Abel ---------- */
async function storySons(){LV=26;CFG=levelCfg(26);csStart();fade(true);AU.init();await wait(1.4);
  await say('Passaram-se os anos…',3.2);
  await say('“Adão conheceu Eva, sua mulher, e ela deu à luz Caim… e depois deu à luz a seu irmão Abel.”<small>GÊNESIS 4:1-2</small>',5.5);
  await useScene(sceneFor(26));env.fallK=1;env.t=.4;env.wt='cloudy';Object.assign(env,WPRE.cloudy);env.wTimer=1e9;spawnAnimals(16,true);
  const [cx,cz]=centerSpot();const P=(dx,dz)=>nearW(cx+dx,cz+dz);
  const adam=mkActor('adam',...P(0,0),{skin:'adamF'}),eve=mkActor('eve',...P(1,.2),{skin:'eveF'}),cain=mkActor('cain',...P(-1.6,.6),{skin:'cain'}),abel=mkActor('abel',...P(2.6,.4),{skin:'abel'});
  actors=[adam,eve,cain,abel];faceTo(adam,eve);faceTo(eve,adam);cain.face=1;abel.face=-1;
  const s=samp(S,cx,cz);V.s=clamp(CH*.16/s.h,sMin(),sMax());V.ox=s.x-CW/V.s/2;V.oy=s.y-s.h-CH/V.s/2;clampView(V);caption('');
  fade(false);await wait(1.2);await say('Fora da perfeição do início, a família de Adão cresceu.',3.6);
  focusOn(cain,.5,1.2,1.1);cain.pose='look';await say('<b>Caim</b>, o mais velho, lavrador da terra. Túnica escura.<small>GÊNESIS 4:2</small>',4.6);
  focusOn(abel,.5,1.2,1.1);abel.pose='wave';await say('<b>Abel</b>, o mais novo, pastor de ovelhas. Túnica clara e cajado.<small>GÊNESIS 4:2</small>',4.6);
  cain.pose=null;abel.pose=null;focusMid(actors,.2,1);await say('Agora são quatro para encontrar.',3);
  save.sons=true;save.level=26;persist();fade(true);await wait(1.6);csEnd();await startLevel(26);fade(false)}

/* ---------- LEVEL 30: hide Abel from Cain ---------- */
async function storyBrothers(){LV=30;CFG=levelCfg(30);csStart();fade(true);AU.init();await useScene(sceneFor(30));env.fallK=1;env.t=.7;env.wt='mist';Object.assign(env,WPRE.mist);env.wTimer=1e9;spawnAnimals(14,true);
  const cfg={hLo:.12,hHi:.45,oLo:0,oHi:.2};const ab=pickSpot(cfg,[]);let cn=null;for(let k=0;k<300;k++){const s=pick(S.spots);const p=spotW(S,s);const d=Math.hypot(p[0]-ab[0],p[1]-ab[1]);if(d>9&&d<12&&s[6]<.3){cn=p;break}}if(!cn)cn=nearW(ab[0]+10,ab[1]);
  const abel=mkActor('abel',...ab,{skin:'abel',sp:3.1}),cain=mkActor('cain',...cn,{skin:'cain',sp:1.45}),adam=mkActor('adam',...nearW(ab[0]+1.5,ab[1]+.5),{skin:'adamF',sp:.8}),eve=mkActor('eve',...nearW(ab[0]+2.3,ab[1]+.3),{skin:'eveF',sp:.8});
  actors=[adam,eve,abel,cain];const s=samp(S,ab[0],ab[1]);V.s=clamp(CH*.13/s.h,sMin(),sMax());V.ox=s.x-CW/V.s/2;V.oy=s.y-s.h-CH/V.s/2;clampView(V);
  fade(false);const stopS=AU.suspense(40,.6);await wait(1);
  await say('Adão e Eva seguem para longe do campo…',2);const far=S.byH[S.byH.length-1];const [fx,fz]=spotW(S,far);goTo(adam,fx,fz);goTo(eve,fx+.6,fz);
  await tween(4,k=>{adam.alpha=eve.alpha=1-smooth(.3,1,k)});adam.a=eve.a=false;actors=[abel,cain];
  focusOn(cain,.4,1.2,1.1);cain.pose='look';await say('“E falou Caim com o seu irmão Abel; e, estando eles no campo…”<small>GÊNESIS 4:8</small>',5);
  focusMid([abel,cain],.12,1);await say('Caim procura por Abel.',2.4);stopS(false);
  csEnd();state='missionIntro';setHUD(false);$('iSub').textContent='Fase 30 · Missão';$('iTitle').textContent='Esconda Abel';
  $('iText').innerHTML='Toque no chão para levar Abel até um esconderijo: moitas, árvores, folhagem. Os brilhos dourados mostram bons esconderijos. Caim está procurando: se ele vir Abel, Abel morre. Aguente <b>10 segundos</b>. O tempo começa quando você tocar em “Assumir o controle”.';
  $('bGo').textContent='Assumir o controle';show('intro',true);MS={abel,cain}}
function beginMission(){$('bGo').textContent='Procurar';const {abel,cain}=MS;state='mission';show('ctrlR',true);show('cd',true);
  const hide=[];for(const s of S.spots){if(s[6]<.55)continue;const [wx,wz]=spotW(S,s);const d=Math.hypot(wx-abel.x,wz-abel.z);const dc=Math.hypot(wx-cain.x,wz-cain.z),da=Math.hypot(abel.x-cain.x,abel.z-cain.z);if(d>4&&d<11&&dc>da+1&&!hide.some(h=>Math.hypot(h[0]-wx,h[1]-wz)<2.5))hide.push([wx,wz,s[6]]);if(hide.length>=7)break}
  Object.assign(MS,{t:10,det:0,hide,done:false,wp:0,ls:[abel.x,abel.z]});cain.sp=1.35;{const dx=cain.x-abel.x,dz=cain.z-abel.z,l=Math.hypot(dx,dz)||1;for(let k=0;k<20;k++){const tx=cain.x+dx/l*2.2+rnd(-2,2),tz=cain.z+dz/l*2.2+rnd(-2,2);if(walkable(S,tx,tz)){goTo(cain,tx,tz);break}}}toast('Toque no chão para levar Abel',2200);AU.heart(true);
  fxAdd=()=>{for(const h of MS.hide){const s=samp(S,h[0],h[1]);if(!s)continue;const p=s.h/1.75,r=.7*p*(1+.08*Math.sin(TT*4+h[0]));rect(s.x-r,s.y-r*.42,2*r,r*.84,FX.ring.uv,0,.5,0,0)}
    const c=samp(S,cain.x,cain.z);if(c){const p=c.h/1.75;rect(c.x-.9*p,c.y-.25*p,1.8*p,.5*p,FX.glow.uv,0,.25*(.5+MS.det),0,0)}};
  focusMid([abel,cain],.1,2)}
function missionTap(sx,sy){if(!MS||MS.done)return;const [ix,iy]=toImg(sx,sy);const s=nearestSpot(S,ix,iy,s=>{const [wx,wz]=spotW(S,s);return Math.hypot(wx-MS.abel.x,wz-MS.abel.z)<16});if(!s)return;
  const [wx,wz]=spotW(S,s);MS.abel.wander=false;goTo(MS.abel,wx,wz);ripple(sx,sy,true);AU.click()}
function updateMission(dt){if(!MS||MS.done||state!=='mission')return;const {abel,cain}=MS;MS.t-=dt;$('cd').textContent=Math.max(0,Math.ceil(MS.t));
  if(!cain.walk){MS.wp++;let tx,tz;const near=MS.wp%3!==0;for(let k=0;k<20;k++){const bx=near?MS.ls[0]:cain.x,bz=near?MS.ls[1]:cain.z;tx=bx+rnd(-4,4);tz=bz+rnd(-4,4);if(walkable(S,tx,tz))break}goTo(cain,tx,tz)}
  const dx=abel.x-cain.x,dz=abel.z-cain.z,d=Math.hypot(dx,dz);const mx=cain.tx-cain.x,mz=cain.tz-cain.z,ml=Math.hypot(mx,mz)||1;const ang=Math.acos(clamp((dx*mx+dz*mz)/(d*ml||1),-1,1));
  const s=samp(S,abel.x,abel.z);const oc=s?s.occ:0;const seen=d<2||(d<8.5&&ang<.8&&oc<.45)||(abel.walk&&d<4);
  if(seen)MS.ls=[abel.x,abel.z];MS.det=clamp(MS.det+(seen?dt:-dt*.6),0,1.2);if(MS.det>1)return missionEnd(false);if(MS.t<=0)return missionEnd(true)}
async function missionEnd(hidden){MS.done=true;show('cd',false);AU.heart(false);csStart();const {abel,cain}=MS;abel.walk=false;cain.walk=false;
  if(!hidden){/* outcome A */focusMid([abel,cain],.25,1);cain.pose='look';faceTo(cain,abel);await say('Caim encontrou Abel.',2.6);
    cain.pose=null;await walkTo(cain,abel.x+(cain.x>abel.x?.9:-.9),abel.z,6);faceTo(cain,abel);faceTo(abel,cain);G.dark=.5;AU.impact(.6);
    await say('“…levantou-se Caim contra o seu irmão Abel.”<small>GÊNESIS 4:8</small>',3.6);abel.pose='fallen';const stop=AU.sad(26);
    await wait(2.2);dustActor(abel);await wait(2.4);actors=[cain];caption('');await wait(1);
    speak('Onde está Abel, teu irmão?',.4,.78);await say('<b>Voz do Senhor:</b> “Onde está Abel, teu irmão?”<small>GÊNESIS 4:9</small>',5);
    await say('Abel não está mais no jardim. Daqui em diante, o jogo segue com Caim.',4.2);stop();save.brother='cain'}
  else{/* outcome B */focusOn(cain,.4,1,1.1);cain.pose='look';await say('O tempo acabou. Caim não encontrou Abel.',3.6);
    cain.pose=null;const far=S.byH[S.byH.length-1];const [fx,fz]=spotW(S,far);goTo(cain,fx,fz);cain.sp=1.1;
    await say('“E saiu Caim de diante da face do Senhor.”<small>GÊNESIS 4:16</small>',3);await tween(3,k=>{cain.alpha=1-k});cain.a=false;
    focusOn(abel,.45,1,1.1);abel.pose='wave';abel.glow=.6;const stop=AU.sad(18,true);await say('Abel sobreviveu. Daqui em diante, o jogo segue com Abel.',4.4);abel.glow=0;abel.pose=null;stop();actors=[abel];save.brother='abel'}
  save.level=31;save.best=Math.max(save.best,30);persist();fade(true);await wait(1.6);csEnd();await startLevel(31);fade(false)}

/* ---------- LEVEL 35: the expulsion ---------- */
async function storyEnd(){LV=35;CFG=levelCfg(35);csStart();fade(true);AU.init();await useScene('F1');env.fallK=1;env.t=.74;env.wt='cloudy';Object.assign(env,WPRE.cloudy);env.wTimer=1e9;spawnAnimals(12,true);
  const sv=save.brother||'cain';const [cx,cz]=centerSpot();const P=(dx,dz)=>nearW(cx+dx,cz+dz);
  const adam=mkActor('adam',...P(0,0),{skin:'adamF',sp:.75}),eve=mkActor('eve',...P(1,0),{skin:'eveF',sp:.75}),son=mkActor(sv,...P(6,3),{skin:sv,sp:.9});adam.alpha=eve.alpha=0;actors=[adam,eve,son];
  V.s=sMin();V.ox=(S.W-CW/V.s)/2;V.oy=(S.H-CH/V.s)/2;clampView(V);fade(false);
  await say('O jardim, depois de tudo.',3.6);
  focusMid([adam,eve],.22,.8);await tween(2.2,k=>{adam.alpha=eve.alpha=k;adam.glow=eve.glow=(1-k)*.8});adam.glow=eve.glow=0;
  await say('Adão e Eva aparecem mais uma vez no meio do jardim.',3.4);
  await walkTo(son,cx-1,cz+.2,8);faceTo(son,adam);faceTo(adam,son);faceTo(eve,son);focusMid(actors,.24,1);await say(NAMES[sv]+' se reúne à família.',3.4);
  /* the presence of God: only light and a voice */
  const gp=samp(S,cx,cz);fxAdd=()=>{const s=gp,p=s.h/1.75,top=V.oy-60,w=7*p;rect(s.x-w/2,top,w,s.y-top,FX.ray.uv,0,.35,0,0);rect(s.x-w,top,w*2,s.y-top,FX.ray.uv,0,.15,0,0)};
  await tween(2.4,k=>{G.glowP=[gp.x,gp.y-1.5*gp.h/1.75,8*gp.h/1.75];G.glowC=[.42*k,.34*k,.18*k];G.dark=.4*k});AU.godTone();
  for(const A of actors)A.pose='pray';
  speak('No suor do teu rosto comerás o teu pão, até que tornes à terra.',.3,.8);await say('<b>Voz do Senhor:</b> “No suor do teu rosto comerás o teu pão, até que tornes à terra.”<small>GÊNESIS 3:19</small>',6.5);
  speak('Saiam do jardim do Éden.',.3,.78);await say('<b>Voz do Senhor:</b> “Saiam do jardim do Éden.”',3.6);
  for(const A of actors)A.pose=null;await tween(2,k=>{G.dark=.4*(1-k)+.1;G.glowC=G.glowC.map(v=>v*(1-k*.04))});
  /* they walk away, seen from behind, into the distance */
  const L=S.byH,n=L.length;let ex=null,bd=1e9;for(let i=Math.floor(n*.9);i<n;i++){const s=L[i];const d=Math.abs(s[2]-S.W/2);if(d<bd){bd=d;ex=s}}const [exx,exz]=spotW(S,ex||L[n-1]);
  const stopF=AU.finale(34);caption('“E o Senhor Deus o lançou fora do jardim do Éden, para lavrar a terra de que fora tomado.”<small>GÊNESIS 3:23</small>');
  goTo(adam,exx,exz);goTo(eve,exx+.7,exz+.2);goTo(son,exx-.7,exz-.1);for(const A of actors){A.free=true}
  fxNorm=null;fxAdd=()=>{const s=samp(S,exx,exz);if(!s)return;const p=s.h/1.75;const k=smooth(0,1,(TT-endT0-8)/3);if(k<=0)return;rect(s.x-3.5*p,s.y-5.5*p,7*p,5.5*p,FX.flame.uv,0,.55*k*(.8+.2*Math.sin(TT*9)),0,0);rect(s.x-1.6*p,s.y-4.2*p,3.2*p,3.2*p,FX.angel.uv,0,.8*k,0,0);rect(s.x-3*p,s.y-5*p,6*p,6*p,FX.glow.uv,0,.35*k,0,0)};
  const endT0=TT;window.endT0=endT0;
  await tween(18,k=>{focusMid(actors,lerp(.2,.08,k),.6);for(const A of actors){const s=samp(S,A.x,A.z);if(s)A.alpha=clamp((s.h-ex[5]*.9)/(ex[5]*2.2),0,1)*(1-smooth(.85,1,k))}
    if(k>.42&&k<.44)caption('“…e pôs querubins ao oriente do jardim, e uma espada flamejante, para guardar o caminho da árvore da vida.”<small>GÊNESIS 3:24</small>')});
  caption('');fade(true);await wait(3.2);stopF();csEnd();save.ended=true;save.level=35;save.best=35;persist();
  $('endTxt').innerHTML='“E chamou o Senhor Deus a Adão, e disse-lhe: Onde estás?”<br><span style="font-size:12px;letter-spacing:.12em;color:#c2a15a">GÊNESIS 3:9</span><br><br>Obrigado por jogar <b>ONDE VOCÊ ESTÁ?</b>'+(sv==='abel'?'<br>Você protegeu Abel até o fim.':'<br>Caim seguiu sozinho até o fim.');
  show('ending',true);state='ending';fade(false)}
$('bAgain').onclick=()=>{resetAll();show('ending',false);goTitle()};$('bEndMenu').onclick=()=>{show('ending',false);goTitle()};

/* ================= LOOP ================= */
AU._bird=AU.bird;AU.bird=function(){if(env.fallK>.5)return;this._bird()};
AU._cr=AU.cricket;AU.cricket=function(k){if(env.fallK>.5)return;this._cr(k)};
let last=performance.now(),hudT=0,auT=0,fallT=3,lonT=6;
function drawHint(){if(!hint)return;hint.t+=1/60;const s=samp(S,hint.x,hint.z);if(!s)return;const p=s.h/1.75,r=hint.r*p*(1+Math.sin(TT*5)*.03);const a=hint.t<6?(.9*(hint.t<5?1:6-hint.t)):0;if(hint.t>6){hint=null;return}
  rect(s.x-r,s.y-r*.45,2*r,r*.9,FX.ring.uv,0,a,0,0)}
function drawParts(){for(const p of parts){const a=Math.max(0,1-p.t/p.life);rect(p.x-p.r,p.y-p.r,2*p.r,2*p.r,FX.spark.uv,0,a,0,0)}}
const baseAdd=drawFxAdd;
function loop(now){requestAnimationFrame(loop);let dt=Math.min((now-last)/1000,.1);last=now;if(ctxLost||!S)return;if(state==='map'||state==='ending'){return}
  TT+=dt;const e=updateEnv(dt)||{day:1,rain:0,fog:0,cloud:0,storm:0};
  if(state==='title'){V.ox+=dt*14*(V.titleDir||1)/V.s;if(V.ox<=0||V.ox>=S.W-CW/V.s)V.titleDir=-(V.titleDir||1);clampView(V)}
  for(const A of animals)stepActor(A,dt,1);
  for(const A of actors){if(state==='play'||state==='mission'||state==='cut'||state==='visit'||state==='found'){if(state!=='play'&&state!=='mission'&&!A.walk){}else{}stepActor(A,dt,1)}}
  if(state==='visit')updateVisit(dt);if(state==='mission')updateMission(dt);
  updView(dt);inertia(dt);updParts(dt);
  auT-=dt;if(auT<=0){AU.update(.1-auT,e);auT=.1;
    if(AU.ctx&&AU.on&&env.fallK>.5&&state!=='cut'){fallT-=.1;if(fallT<=0){fallT=rnd(6,14);if(R()<.55)AU.crow();else AU.bleat()}
      if(LV>=31){lonT-=.1;if(lonT<=0){lonT=rnd(4,9);AU.lonelyNote()}}}}
  hudT-=dt;if(hudT<=0&&state==='play'){hudT=.25;const tx=fmt(elapsed());if(tx!==lastTimeTxt){$('timer').textContent=tx;lastTimeTxt=tx}const el=envLabel(e);if(el!==lastEnvTxt){$('hEnv').textContent=el;lastEnvTxt=el}}
  for(const A of actors)if(A.sel&&!A.dust&&!A.got)A.glow=.6+.4*Math.sin(TT*6);
  render()}
/* extra overlays drawn every frame (hint ring, dust) on top of scene-specific fx */
const _dfa=drawFxAdd;drawFxAdd=function(){_dfa();drawHint();drawParts()};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state==='play')pausedAt=performance.now();if(AU.ctx)AU.ctx.suspend()}else{if(state==='play')tStart+=performance.now()-pausedAt;if(AU.ctx&&save.sound)AU.ctx.resume()}});
async function boot(){resize();buildFx();await loadAtlas();syncSoundBtns();await goTitle();$('loading').style.display='none';requestAnimationFrame(loop);
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{})}
window.__G={get S(){return S},get state(){return state},set state(v){state=v},env,V,G,save,actors:()=>actors,animals:()=>animals,startLevel,storyFall,storySons,storyBrothers,storyEnd,startVisit,openMap,goTitle,
  get CS(){return CS},get MS(){return MS},samp,toScr,onTap,get LV(){return LV}};
boot().catch(e=>{console.error(e);fatal('Não consegui carregar o jogo ('+e.message+'). Verifique a internet e toque em "Recarregar".')});

