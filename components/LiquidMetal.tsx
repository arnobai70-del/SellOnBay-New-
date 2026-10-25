'use client';
import { useEffect, useRef, useState } from 'react';

type Tone = 'cobalt' | 'mint' | 'gold';
/* dark, mid and light stop of the metal for each hero colour */
const PAL: Record<Tone, number[][]> = {
  cobalt: [
    [0.02, 0.05, 0.36],
    [0.17, 0.24, 1.0],
    [0.86, 0.9, 1.0],
  ],
  mint: [
    [0.0, 0.2, 0.17],
    [0.05, 0.62, 0.46],
    [0.86, 1.0, 0.95],
  ],
  gold: [
    [0.62, 0.36, 0.0],
    [1.0, 0.71, 0.18],
    [1.0, 0.96, 0.82],
  ],
};

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r;uniform float t;uniform vec2 m;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*noise(p);p=p*2.03+vec2(5.2,1.3);a*=.5;}return s;}
float field(vec2 p){
  vec2 q=vec2(fbm(p+vec2(0.,t*.045)),fbm(p+vec2(5.2,1.3)-t*.035));
  vec2 w=vec2(fbm(p+1.5*q+vec2(1.7,9.2)+t*.05),fbm(p+1.5*q+vec2(8.3,2.8)-t*.04));
  return fbm(p+1.7*w);
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*r)/r.y*.85+(m-.5)*.2;
  float e=.01;float h=field(p);
  vec2 g=vec2(field(p+vec2(e,0.))-h,field(p+vec2(0.,e))-h)/e;
  vec3 n=normalize(vec3(-g*.28,1.));
  vec3 rf=reflect(vec3(0.,0.,-1.),n);
  float band=.5+.5*sin(rf.y*3.4+rf.x*1.6+h*2.);
  vec3 col=mix(c0,c1,smoothstep(.05,.6,band));
  col=mix(col,c2,smoothstep(.7,1.,band));
  float spec=pow(max(dot(n,normalize(vec3(.35,.55,.75))),0.),32.);
  col+=spec*.4;
  gl_FragColor=vec4(col,1.);
}`;

/* Slow liquid chrome behind the hero. Own shader, tinted by the slide colour. Renders at reduced size, pauses off-screen,
   and is skipped (plain colour) for reduced motion or when WebGL is missing. */
export function LiquidMetal({ tone }: { tone: Tone }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const want = useRef<number[][]>(PAL[tone]);
  want.current = PAL[tone];
  // null until we know the visitor's choice. Reduced motion starts paused, but they can press play.
  const [play, setPlay] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const playing = useRef(false);
  const kick = useRef<() => void>(() => {});
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('lb-bg');
    } catch {
      /* storage can be blocked */
    }
    setPlay(saved ? saved === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  useEffect(() => {
    playing.current = !!play;
    if (play) kick.current();
  }, [play]);
  // A new slide colour is painted straight away, even while paused.
  useEffect(() => {
    redraw.current();
  }, [tone]);

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const gl = el.getContext('webgl', { antialias: false, powerPreference: 'low-power' });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return; // the plain CSS layer stays visible
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(pr, n);
    const [ur, ut, um, u0, u1, u2] = [U('r'), U('t'), U('m'), U('c0'), U('c1'), U('c2')];

    const cur = PAL[tone].map((c) => [...c]);
    const mouse = [0.5, 0.5],
      aim = [0.5, 0.5];
    const size = () => {
      const k = 0.5,
        w = Math.max(2, Math.round(el.clientWidth * k)),
        h = Math.max(2, Math.round(el.clientHeight * k));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      gl.viewport(0, 0, w, h);
    };
    const lost = (e: Event) => {
      e.preventDefault();
      delete el.dataset.ready;
      setReady(false);
    };
    el.addEventListener('webglcontextlost', lost);
    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      aim[0] = (e.clientX - b.left) / b.width;
      aim[1] = 1 - (e.clientY - b.top) / b.height;
    };
    addEventListener('pointermove', onMove, { passive: true });

    let on = true,
      raf = 0,
      last = 0,
      tm = 7,
      drawn = false;
    function frame(now: number) {
      raf = 0;
      if (!on || document.hidden) return;
      const go = playing.current;
      if (!go && drawn) return; // paused: keep the last picture, spend nothing
      if (go) raf = requestAnimationFrame(frame);
      if (go && now - last < 33) return; // about 30 frames a second is plenty for a slow flow
      const dt = Math.min(0.1, (now - last) / 1000 || 0.033);
      last = now;
      if (go) tm += dt;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cur[i][j] += (want.current[i][j] - cur[i][j]) * (drawn ? Math.min(1, dt * 2.2) : 1);
      mouse[0] += (aim[0] - mouse[0]) * 0.04;
      mouse[1] += (aim[1] - mouse[1]) * 0.04;
      size();
      gl!.uniform2f(ur, el!.width, el!.height);
      gl!.uniform1f(ut, tm);
      gl!.uniform2f(um, mouse[0], mouse[1]);
      gl!.uniform3fv(u0, cur[0]);
      gl!.uniform3fv(u1, cur[1]);
      gl!.uniform3fv(u2, cur[2]);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      el!.dataset.frames = String(+(el!.dataset.frames ?? 0) + 1);
      if (!drawn) {
        drawn = true;
        el!.dataset.ready = '1';
        setReady(true);
      }
    }
    kick.current = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    redraw.current = () => {
      if (!playing.current && drawn) {
        drawn = false;
        kick.current();
      }
    };
    const io = new IntersectionObserver(([en]) => {
      on = en.isIntersecting;
      if (on) kick.current();
    });
    io.observe(el);
    const ro = new ResizeObserver(() => {
      if (!playing.current && drawn) {
        drawn = false;
      }
      kick.current();
    });
    ro.observe(el);
    const vis = () => {
      if (!document.hidden) kick.current();
    };
    document.addEventListener('visibilitychange', vis);
    kick.current();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      removeEventListener('pointermove', onMove);
      el.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('visibilitychange', vis);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // The slide colour is read from a ref so the animation is not restarted on every slide change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const v = !play;
    setPlay(v);
    try {
      localStorage.setItem('lb-bg', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div className="metal-fb" aria-hidden="true" />
      <canvas ref={cv} className="metal" aria-hidden="true" />
      {ready && play !== null && (
        <button type="button" className="metal-btn" aria-pressed={play} onClick={toggle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {play ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5l11 7-11 7z" />}
          </svg>
          {play ? 'Pause background' : 'Play background'}
        </button>
      )}
    </>
  );
}
