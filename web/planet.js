import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BASE = 'https://api.getlayers.ai/storage/v1/object/public/public/assets/ascend-d9857ad1f2/';
const CONFIG = {
  rimColor:'#c1faff', rimPower:2.4, nightLights:10, terrainDepth:0.33, terrainShade:1.3,
  oceanGlint:0.45, oceanDeep:0.12, oceanFlow:3, oceanFlowSpeed:0.8, oceanFlowScale:2.1,
  glowColor:'#3a6cff', glowIntensity:3.35, planetRadius:1.95, spin:0.03, initRotation:2.07,
  tilt:0.37, autoRotate:0,
  cloud1Height:1.005, cloud1Opacity:0.6, cloud1Spin:0.06,
  cloud2Height:1.03, cloud2Opacity:0.5, cloud2Spin:0.14,
  cloud3Height:1.075, cloud3Opacity:0.5, cloud3Spin:0.1,
  bgColor:'#040a1e', flameColor:'#3a6cff', flameColor2:'#c1faff', flameAmt:0.15,
  atmoColor:'#9fc4ff', atmoCount:320, atmoSize:22, atmoSpeed:0.8,
  starColor:'#cfe0ff', starCount:1400, starSize:1.6, starFlicker:1,
  markerColor:'#ffd27a', markerCount:60, markerSize:16, markerSpeed:0.5,
};
const LAYERS = { NONE:0, TORUS_SCENE:1, BLOOM_SCENE:2, ENTIRE_SCENE:3 };
const Lerp = (a,b,t) => a+(b-a)*t, clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
const hexToVec3 = h => { const c = new THREE.Color(h); return new THREE.Vector3(c.r,c.g,c.b); };
const sample = (s,p) => { if (p<=s[0].p) return s[0].v; for (let i=1;i<s.length;i++) if (p<=s[i].p) { const a=s[i-1],b=s[i]; let t=(p-a.p)/(b.p-a.p); t=t*t*(3-2*t); return Lerp(a.v,b.v,t); } return s[s.length-1].v; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SNOISE = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx; vec3 x2 = x0 - i2 + 2.0 * C.xxx; vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

const canvas = document.querySelector('.planet-canvas');
const renderer = new THREE.WebGL1Renderer({ canvas, antialias:true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0,0,8);
[1,2,3].forEach(l => camera.layers.enable(l)); scene.add(camera);
const amb = new THREE.AmbientLight(0xffffff, 1.8), dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(0,10,2); amb.layers.set(3); dir.layers.set(3); scene.add(amb, dir);

const FinalPass = {
  uniforms: { iTime:{value:0}, tDiffuse:{value:null}, torusTexture:{value:null}, bloomTexture:{value:null}, haloTexture:{value:null},
    uBg:{value:hexToVec3(CONFIG.bgColor)}, uFlameA:{value:hexToVec3(CONFIG.flameColor)}, uFlameB:{value:hexToVec3(CONFIG.flameColor2)}, uFlameAmt:{value:CONFIG.flameAmt} },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float iTime; uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture;
    uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
    varying vec2 vUv;
    vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
      pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
      pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
      pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
      return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
    void main(){
      vec2 uv = 2.*vUv - 1.;
      vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
      vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
      flame *= smoothstep(0.25, 1., abs(uv.y));
      float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
      vec3 bg = uBg * (1.0 - 0.4 * length(uv));
      vec3 halo = texture2D(haloTexture, vUv).xyz;
      gl_FragColor = vec4(bg + flame*uFlameAmt + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
    }`,
};

const W = innerWidth, H = innerHeight;
const torusComposer = new EffectComposer(renderer); torusComposer.renderToScreen = false;
torusComposer.addPass(new RenderPass(scene, camera)); torusComposer.addPass(new ShaderPass(GammaCorrectionShader));
torusComposer.addPass(new UnrealBloomPass(new THREE.Vector2(W,H), 0.22, 0.2, 0)); torusComposer.addPass(new ShaderPass(CopyShader));
const bloomComposer = new EffectComposer(renderer); bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera)); bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(W,H), 0.5, 0.6, 0));
bloomComposer.addPass(new ShaderPass(GammaCorrectionShader));
const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(new RenderPass(scene, camera));
const finalPass = new ShaderPass(FinalPass); finalComposer.addPass(finalPass);
finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture;
finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture;

const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping:true, dampingFactor:0.06, enablePan:false, enabled:false, autoRotate:true, autoRotateSpeed:CONFIG.autoRotate, minDistance:3.5, maxDistance:16 });
controls.target.set(0,0,0);

const STOPS_X = [{p:0,v:0},{p:0.32,v:-3.1},{p:0.64,v:3.2},{p:1,v:0}];
const STOPS_Y = [{p:0,v:-4.5},{p:0.32,v:0.55},{p:0.64,v:0.45},{p:1,v:0.15}];
const STOPS_S = [{p:0,v:2.15},{p:0.32,v:1.0},{p:0.64,v:0.92},{p:1,v:1.12}];
const worldGroup = new THREE.Group(), planetGroup = new THREE.Group(), cloudGroup = new THREE.Group();
planetGroup.rotation.z = CONFIG.tilt; cloudGroup.rotation.z = CONFIG.tilt; cloudGroup.visible = false;
worldGroup.position.set(STOPS_X[0].v, STOPS_Y[0].v, 0); worldGroup.scale.setScalar(STOPS_S[0].v);
worldGroup.add(planetGroup, cloudGroup); scene.add(worldGroup);
const onFinal = o => o.traverse(c => c.layers.set(LAYERS.ENTIRE_SCENE));
const res = () => new THREE.Vector2(innerWidth*renderer.getPixelRatio(), innerHeight*renderer.getPixelRatio());

/* atmosphere halo */
const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
  transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending,
  uniforms:{ uGlow:{value:hexToVec3(CONFIG.glowColor)}, uIntensity:{value:CONFIG.glowIntensity} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`uniform vec3 uGlow; uniform float uIntensity; varying vec2 vUv;
    void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2); gl_FragColor = vec4(uGlow * a * uIntensity, a); }`
}));
glowMesh.scale.setScalar(CONFIG.planetRadius*2.3); glowMesh.visible = false; worldGroup.add(glowMesh);

/* clouds */
const cloudTimeU = { value:0 }, planetTimeU = { value:0 };
const cloudMeshes = [];
const cloudInit = tex => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5,5);
  [{h:'cloud1Height',o:'cloud1Opacity',s:'cloud1Spin',ry:0.0,phase:0.0},{h:'cloud2Height',o:'cloud2Opacity',s:'cloud2Spin',ry:2.2,phase:13.0},{h:'cloud3Height',o:'cloud3Opacity',s:'cloud3Spin',ry:4.3,phase:27.0}].forEach(ly => {
    const mat = new THREE.MeshStandardMaterial({ map:tex, transparent:true, depthWrite:false });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime:cloudTimeU, noiseScale:{value:20}, uSpeedX:{value:1}, uSpeedY:{value:2}, uSpeedZ:{value:2}, uOpacity:{value:CONFIG[ly.o]}, uPhase:{value:ly.phase} });
      sh.vertexShader = 'varying vec2 vCloudUv;\n' + sh.vertexShader.replace(/void main\(\s*\)\s*\{/, 'void main(){ vCloudUv = uv;');
      sh.fragmentShader = 'uniform float uTime,noiseScale,uSpeedX,uSpeedY,uSpeedZ,uOpacity,uPhase; varying vec2 vCloudUv;\n' + SNOISE + '\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
gl_FragColor.rgb = vec3(1.0);
float cloudNoise = snoise(vec3(vCloudUv.x * noiseScale + uTime * uSpeedX + uPhase, vCloudUv.y * noiseScale - uTime * uSpeedY + uPhase, uTime * uSpeedZ + uPhase));
float cloudNdv = max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0);
float cloudEdge = pow(1.0 - cloudNdv, 3.0);
float cloudMod = mix(cloudNoise, 1.0, cloudEdge);
float cloudNdl = dot(normalize(vNormal), normalize(vec3(-0.9, 0.18, 0.4)));
float cloudDay = 1.0 - smoothstep(0.30, -0.30, cloudNdl) * 0.9;
gl_FragColor.a *= cloudMod * uOpacity * cloudDay;`);
    };
    const m = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.planetRadius*CONFIG[ly.h], 64, 64), mat);
    m.rotation.y = ly.ry; m.renderOrder = 2; m.userData.spin = ly.s; cloudGroup.add(m); cloudMeshes.push(m);
  });
  onFinal(cloudGroup);
};
new THREE.TextureLoader().load(BASE+'planet-clouds.png', cloudInit, undefined, () => cloudInit(proceduralCloud()));

/* motes */
const rnd = n => Array.from({length:n}, Math.random);
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(rnd(CONFIG.atmoCount*3).map(v=>v*2-1), 3));
moteGeo.setAttribute('size', new THREE.Float32BufferAttribute(rnd(CONFIG.atmoCount).map(v=>CONFIG.atmoSize*(0.4+v)), 1));
moteGeo.setAttribute('seed', new THREE.Float32BufferAttribute(rnd(CONFIG.atmoCount), 1));
const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
  transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false,
  uniforms:{ uTime:{value:0}, uRes:{value:res()}, uColor:{value:hexToVec3(CONFIG.atmoColor)} },
  vertexShader:`attribute float size; attribute float seed; uniform float uTime; uniform vec2 uRes;
varying float vA;
vec3 warp(vec3 p, float t){ float c=0.9,a=1.9,b=0.02,s=0.05; p*=2.;
  p.x+=c*sin(s*t+a*p.y)+t*b; p.y+=c*cos(s*t+a*p.x); p.y+=c*sin(s*t+a*p.z)+t*b;
  p.z+=c*cos(s*t+a*p.y); p.z+=c*sin(s*t+a*p.x)+t*b; p.x+=c*cos(s*t+a*p.z);
  return cos(p+vec3(1,2,4)); }
void main(){
  vec3 v = position*4.0 + warp(position, uTime)*1.2;
  vec4 mv = modelViewMatrix * vec4(v, 1.0);
  float r = length(v); float farF = 1.0 - smoothstep(5.0, 6.5, r); float nearF = smoothstep(0.0, 0.5, -mv.z);
  vA = farF * nearF;
  gl_PointSize = size * uRes.y / 900.0 / -mv.z; gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader:`uniform vec3 uColor; varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float l = length(p); if (l > 0.5) discard;
  float tex = smoothstep(0.5, 0.0, l); gl_FragColor = vec4(uColor * tex, tex * vA * 0.55); }`
}));
motes.frustumCulled = false;
motes.onBeforeRender = () => { const t = performance.now()/1000; motes.material.uniforms.uTime.value = t*CONFIG.atmoSpeed*8; motes.position.copy(camera.position); finalPass.uniforms.iTime.value = t; };
scene.add(motes); onFinal(motes);

/* stars */
const sp = [], sseed = [], sbr = [];
for (let i=0;i<CONFIG.starCount;i++) { const u=Math.random()*2-1, a=Math.random()*Math.PI*2, r=Math.sqrt(1-u*u); sp.push(90*r*Math.cos(a), 90*u, 90*r*Math.sin(a)); sseed.push(Math.random()*100); sbr.push(0.35+Math.random()*0.65); }
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp,3)); starGeo.setAttribute('seed', new THREE.Float32BufferAttribute(sseed,1)); starGeo.setAttribute('bright', new THREE.Float32BufferAttribute(sbr,1));
const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
  transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true,
  uniforms:{ uTime:{value:0}, uSize:{value:CONFIG.starSize}, uFlicker:{value:CONFIG.starFlicker}, uColor:{value:hexToVec3(CONFIG.starColor)}, uRes:{value:res()} },
  vertexShader:`attribute float seed; attribute float bright;
uniform float uTime; uniform float uSize; uniform float uFlicker; uniform vec2 uRes;
varying float vTw;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.6 + 0.4 * sin(uTime * uFlicker + seed);
  vTw = bright * tw;
  gl_PointSize = max(uSize * uRes.y / 900.0 * (90.0 / max(-mv.z, 1.0)), 1.0);
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader:`uniform vec3 uColor; varying float vTw;
void main(){
  vec2 p = gl_PointCoord - 0.5; float l = length(p); if (l > 0.5) discard;
  float core = smoothstep(0.5, 0.0, l);
  gl_FragColor = vec4(uColor, core * vTw);
}`
}));
stars.frustumCulled = false; scene.add(stars); onFinal(stars);

/* markers (built after planet loads) */
const markerTimeU = { value:0 };
function buildMarkers(mesh) {
  const img = mesh.material.map && mesh.material.map.image; if (!img) return;
  const cw = 1024, ch = Math.round(1024*(img.height/img.width)), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cw, ch); const px = cx.getImageData(0,0,cw,ch).data;
  const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
  const tri = idx ? idx.count/3 : pos.count/3, vi = (t,k) => idx ? idx.getX(t*3+k) : t*3+k;
  const cum = new Float32Array(tri), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(); let tot = 0;
  for (let t=0;t<tri;t++) { A.fromBufferAttribute(pos,vi(t,0)); B.fromBufferAttribute(pos,vi(t,1)); C.fromBufferAttribute(pos,vi(t,2)); tot += B.clone().sub(A).cross(C.clone().sub(A)).length()/2; cum[t] = tot; }
  const out = [], seeds = [];
  for (let n=0; out.length/3 < CONFIG.markerCount && n < CONFIG.markerCount*400; n++) {
    const r = Math.random()*tot; let lo=0, hi=tri-1; while (lo<hi) { const m=(lo+hi)>>1; cum[m] < r ? lo=m+1 : hi=m; }
    const i0=vi(lo,0), i1=vi(lo,1), i2=vi(lo,2); let a=Math.random(), b=Math.random(); if (a+b>1) { a=1-a; b=1-b; } const c=1-a-b;
    const u = uv.getX(i0)*a+uv.getX(i1)*b+uv.getX(i2)*c, v = uv.getY(i0)*a+uv.getY(i1)*b+uv.getY(i2)*c;
    const o = (Math.min(ch-1,Math.floor(v*ch))*cw + Math.min(cw-1,Math.floor(u*cw)))*4, cr=px[o], cg=px[o+1], cb=px[o+2];
    if (cb > cr+6 && cb > cg+6) continue;
    A.fromBufferAttribute(pos,i0); B.fromBufferAttribute(pos,i1); C.fromBufferAttribute(pos,i2);
    const p = A.multiplyScalar(a).add(B.multiplyScalar(b)).add(C.multiplyScalar(c)).multiplyScalar(1.012);
    out.push(p.x,p.y,p.z); seeds.push(Math.random());
  }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(out,3)); mg.setAttribute('seed', new THREE.Float32BufferAttribute(seeds,1));
  const pts = new THREE.Points(mg, new THREE.ShaderMaterial({
    transparent:true, blending:THREE.AdditiveBlending, depthTest:true, depthWrite:false,
    uniforms:{ uTime:markerTimeU, uColor:{value:hexToVec3(CONFIG.markerColor)}, uSize:{value:CONFIG.markerSize}, uSpeed:{value:CONFIG.markerSpeed}, uRes:{value:res()} },
    vertexShader:`attribute float seed; uniform float uSize; uniform vec2 uRes;
varying float vSeed; varying float vFade;
void main(){
  vSeed = seed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 vn = normalize(normalMatrix * normalize(position));
  vec3 vd = normalize(-mv.xyz);
  vFade = smoothstep(0.15, 0.5, dot(vn, vd));
  gl_PointSize = max(uSize * uRes.y / 900.0 * (7.0 / max(-mv.z, 1.0)), 2.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader:`uniform vec3 uColor; uniform float uTime; uniform float uSpeed;
varying float vSeed; varying float vFade;
void main(){
  if (vFade <= 0.001) discard;
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.30, 0.0, d) * 1.2;
  float ph = fract(uTime * uSpeed + vSeed);
  float ring = smoothstep(0.07, 0.0, abs(d - ph)) * (1.0 - ph);
  gl_FragColor = vec4(uColor, clamp(core + ring, 0.0, 1.0) * vFade);
}`
  }));
  pts.frustumCulled = false; mesh.add(pts);
}

/* planet */
function proceduralCloud() { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,4,4); return new THREE.CanvasTexture(c); }
function proceduralEarth() {
  const w = 1024, h = 512, mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hash = (x,y) => { const s = Math.sin(x*127.1+y*311.7)*43758.5453; return s-Math.floor(s); };
  const vn = (x,y) => { const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf), a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; };
  const fbm = (x,y) => { let s=0, a=.5; for (let o=0;o<5;o++) { s += a*vn(x,y); x*=2; y*=2; a*=.5; } return s; };
  const cm = mk(), cn = mk(), xm = cm.getContext('2d'), xn = cn.getContext('2d'), im = xm.createImageData(w,h), inn = xn.createImageData(w,h);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const n = fbm(x/w*6, y/h*3), lat = Math.abs(y/h-.5)*2, land = n > .52, o = (y*w+x)*4; let r, g, b;
    if (!land) { const d = Math.min(1,(.52-n)*4); r = 10+10*(1-d); g = 45+30*(1-d); b = 110+50*(1-d); }
    else { const e = (n-.52)*5; r = 60+e*80; g = 110+e*30-lat*20; b = 50+e*40; if (lat > .85) r = g = b = 225; }
    im.data[o]=r; im.data[o+1]=g; im.data[o+2]=b; im.data[o+3]=255;
    const lit = land && lat < .8 && fbm(x/w*40, y/h*20) > .62;
    inn.data[o]=lit?255:0; inn.data[o+1]=lit?190:0; inn.data[o+2]=lit?90:0; inn.data[o+3]=255;
  }
  xm.putImageData(im,0,0); xn.putImageData(inn,0,0);
  const map = new THREE.CanvasTexture(cm), night = new THREE.CanvasTexture(cn); map.encoding = THREE.sRGBEncoding;
  return { mesh:new THREE.Mesh(new THREE.SphereGeometry(1,128,64), new THREE.MeshStandardMaterial({ map })), nightTex:night };
}
let entryT = -1;
const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
const getBuf = (u, type = 'arraybuffer') => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return type === 'arraybuffer' ? r.arrayBuffer() : r.text(); })
  .catch(() => new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open('GET', u); x.responseType = type === 'arraybuffer' ? 'arraybuffer' : 'text';
    x.onload = () => x.status < 400 ? ok(x.response) : no(new Error(u + ' HTTP ' + x.status)); x.onerror = () => no(new Error('Blocked or unreachable (network/CORS/CSP): ' + u)); x.send(); }));
const DRACO_BASES = ['https://www.gstatic.com/draco/versioned/decoders/1.5.5/', 'https://cdn.jsdelivr.net/npm/three@0.143.0/examples/js/libs/draco/gltf/'];
draco._loadLibrary = async (u, t) => { let err; for (const b of DRACO_BASES) { try { return await getBuf(b + u, t === 'arraybuffer' ? 'arraybuffer' : 'text'); } catch (e) { err = e; } } throw err; };
const gltf = new GLTFLoader(); gltf.setDRACOLoader(draco);
const firstMesh = root => { let m = null; root.traverse(o => { if (!m && o.isMesh) m = o; }); return m; };
const loadG = u => getBuf(u).then(buf => new Promise((ok, no) => gltf.parse(buf, '', ok, no)));
(async () => {
  let nightTex, mesh;
  try {
    nightTex = firstMesh((await loadG(BASE+'planet-lights.glb')).scene).material.map;
    mesh = firstMesh((await loadG(BASE+'planet.glb')).scene);
  } catch (e) { console.warn('Asset host unreachable, using procedural planet:', e.message); ({ mesh, nightTex } = proceduralEarth()); }
  mesh.geometry.computeBoundingSphere(); mesh.scale.setScalar(CONFIG.planetRadius / mesh.geometry.boundingSphere.radius);
  const mat = mesh.material.clone(); Object.assign(mat, { metalness:0, roughness:1, envMapIntensity:0 }); mat.extensions = { derivatives:true };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { time:planetTimeU, noiseScale:{value:30}, speedX:{value:1.5}, speedY:{value:2.0}, speedZ:{value:2.5},
      rimColor:{value:hexToVec3(CONFIG.rimColor)}, rimPower:{value:CONFIG.rimPower}, nightBlendTexture:{value:nightTex}, nightLights:{value:CONFIG.nightLights},
      terrainDepth:{value:CONFIG.terrainDepth}, terrainShade:{value:CONFIG.terrainShade}, oceanGlint:{value:CONFIG.oceanGlint}, oceanDeep:{value:CONFIG.oceanDeep},
      oceanFlow:{value:CONFIG.oceanFlow}, oceanFlowSpeed:{value:CONFIG.oceanFlowSpeed}, oceanFlowScale:{value:CONFIG.oceanFlowScale} });
    sh.vertexShader = 'varying vec2 vCustomUv;\n' + sh.vertexShader.replace(/void main\(\s*\)\s*\{/, 'void main(){ vCustomUv = uv;');
    sh.fragmentShader = `uniform float time,noiseScale,speedX,speedY,speedZ,rimPower,nightLights,terrainDepth,terrainShade,oceanGlint,oceanDeep,oceanFlow,oceanFlowSpeed,oceanFlowScale;
uniform vec3 rimColor; uniform sampler2D nightBlendTexture; varying vec2 vCustomUv;\n` + SNOISE + '\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
vec3 normalizedNormal = normalize(vNormal);
vec3 viewDir = normalize(vViewPosition);
float rim = 1.0 - max(dot(viewDir, normalizedNormal), 0.0);
rim = pow(rim, rimPower); rim = pow(rim, 1.5); rim *= 0.7;
vec3 currentColor = gl_FragColor.rgb;
float blueDom = currentColor.b - max(currentColor.r, currentColor.g);
float waterMask = clamp(smoothstep(-0.005, 0.03, blueDom), 0.0, 1.0);
float shimmer = snoise(vec3(vCustomUv.x * noiseScale + time * speedX, vCustomUv.y * noiseScale - time * speedY, time * speedZ));
gl_FragColor.rgb += waterMask * shimmer * 0.025;
float fT = time * oceanFlowSpeed * 4.0;
float fS = 4.0 * oceanFlowScale;
float warp = snoise(vec3(vCustomUv.x * fS - fT * 0.5, vCustomUv.y * fS + fT * 0.4, fT * 0.5));
float flow = snoise(vec3(vCustomUv.x * fS * 2.0 + fT * 0.6 + warp, vCustomUv.y * fS * 2.0 - fT * 0.5, fT * 0.7));
flow = warp * 0.6 + flow * 0.4;
gl_FragColor.rgb += waterMask * flow * 0.12 * oceanFlow;
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.01, 0.06, 0.16), waterMask * oceanDeep);
vec3 finalColor = mix(gl_FragColor.rgb, rimColor, rim);
gl_FragColor = vec4(finalColor, 1.0);
vec3 surfPos = -vViewPosition;
float terrH = dot(texture2D(map, vCustomUv).rgb, vec3(0.299, 0.587, 0.114));
vec3 sigX = dFdx(surfPos), sigY = dFdy(surfPos);
vec3 vR1 = cross(sigY, normalizedNormal), vR2 = cross(normalizedNormal, sigX);
float fDet = dot(sigX, vR1);
vec3 vGrad = sign(fDet) * (dFdx(terrH) * vR1 + dFdy(terrH) * vR2);
vec3 bumpedNormal = normalize(abs(fDet) * normalizedNormal - terrainDepth * vGrad);
vec3 shadeNormal = mix(bumpedNormal, normalizedNormal, waterMask);
vec3 cityLights = texture2D(nightBlendTexture, vCustomUv).rgb * gl_FragColor.rgb * nightLights;
vec3 viewSunDir = normalize(vec3(-0.9, 0.18, 0.4));
float ndl = dot(normalizedNormal, viewSunDir);
float dayAmt = smoothstep(-0.05, 0.35, ndl);
float relief = dot(shadeNormal, viewSunDir) - ndl;
gl_FragColor.rgb *= clamp(1.0 + relief * terrainShade * dayAmt, 0.55, 1.6);
float nightFactor  = smoothstep(0.18, -0.30, ndl);
float lightsFactor = smoothstep(0.30, -0.35, ndl);
gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.08, nightFactor);
gl_FragColor.rgb += cityLights * lightsFactor;
vec3 halfDir = normalize(viewSunDir + viewDir);
float ripple = snoise(vec3(vCustomUv * 240.0, time * 4.0));
float ndh = max(dot(normalizedNormal, halfDir) + ripple * 0.02, 0.0);
float glint = pow(ndh, 140.0);
gl_FragColor.rgb += glint * waterMask * dayAmt * oceanGlint * vec3(1.0, 0.97, 0.88);`);
  };
  mesh.material = mat; planetGroup.add(mesh);
  try { buildMarkers(mesh); } catch (e) { console.warn('markers', e); }
  cloudGroup.visible = true; glowMesh.visible = true; onFinal(worldGroup);
  entryT = reduced ? 1 : 0;
})().catch(e => console.warn('planet failed to load', e));

/* loop */
let planetTime = 0, cloudTime = 0, starTime = 0, markerTime = 0, spinPhase = 0, curP = 0, curX = STOPS_X[0].v, curY = STOPS_Y[0].v, curS = STOPS_S[0].v, last = performance.now();
const ENTRY_DUR = 1.9, ENTRY_START_Y = -6.5;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now-last)/1000); last = now;
  planetTime += dt/12; cloudTime += dt/20; starTime += dt; markerTime += dt; spinPhase += dt*CONFIG.spin;
  planetTimeU.value = planetTime; cloudTimeU.value = cloudTime; markerTimeU.value = markerTime; stars.material.uniforms.uTime.value = starTime;
  const pT = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1);
  curP += (pT-curP)*Math.min(1, dt*4.5);
  const side = clamp(innerWidth/1200, 0.5, 1), k = Math.min(1, dt*3.2);
  curX += (sample(STOPS_X, curP)*side - curX)*k; curY += (sample(STOPS_Y, curP) - curY)*k; curS += (sample(STOPS_S, curP) - curS)*k;
  let entryY = 0;
  if (entryT >= 0) { if (entryT < 1) entryT = Math.min(1, entryT + dt/ENTRY_DUR); entryY = ENTRY_START_Y*(1-(1-(1-entryT)**3)); }
  worldGroup.position.set(curX, curY+entryY, 0); worldGroup.scale.setScalar(curS);
  planetGroup.rotation.y = CONFIG.initRotation + spinPhase + curP*Math.PI*1.6;
  cloudMeshes.forEach(m => m.rotation.y += dt*CONFIG[m.userData.spin]);
  glowMesh.quaternion.copy(camera.quaternion);
  controls.update();
  camera.layers.set(LAYERS.TORUS_SCENE); torusComposer.render();
  camera.layers.set(LAYERS.BLOOM_SCENE); bloomComposer.render();
  camera.layers.set(LAYERS.ENTIRE_SCENE); finalComposer.render();
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  const w = innerWidth, h = innerHeight, pr = devicePixelRatio;
  camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  [torusComposer, bloomComposer, finalComposer].forEach(c => { c.setPixelRatio(pr); c.setSize(w, h); });
  [motes, stars].forEach(p => p.material.uniforms.uRes.value.copy(res()));
  planetGroup.traverse(o => { if (o.isPoints) o.material.uniforms.uRes.value.copy(res()); });
});
