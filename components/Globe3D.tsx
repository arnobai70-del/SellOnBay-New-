'use client';
import { useEffect, useRef, useState } from 'react';

const DOMAINS = [
  'mariasbakery.com',
  'northsidedental.com',
  'folio.studio',
  'greenleaf.shop',
  'taskboard.app',
  'fitlab.co',
  'bluebrick.io',
  'tutorly.net',
  'pawprint.vet',
  'saffrontable.com',
  'coastline.homes',
  'quillnote.app',
];

/*
 * A planet of dots that is made of SellOnBay sites: pins light up one after another as a domain goes live, an arc joins it to another,
 * and its address pops up. Own scene (three.js, client only). It pauses off-screen, shows one still picture for reduced motion,
 * and falls back to a flat CSS planet when WebGL is missing.
 */
export function Globe3D({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stop = () => {};
    let dead = false;

    (async () => {
      let T: typeof import('three');
      try {
        T = await import('three');
      } catch {
        if (!dead) setFallback(true);
        return;
      }
      if (dead) return;
      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      } catch {
        setFallback(true);
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      el.appendChild(renderer.domElement);

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
      camera.position.set(0, 0, 4.5);
      const globe = new T.Group();
      globe.rotation.x = 0.38;
      scene.add(globe);

      // Seeded random and a small 3D value noise, so every visit draws the same planet.
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const hash = (x: number, y: number, z: number) => {
        const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        return s - Math.floor(s);
      };
      const vnoise = (x: number, y: number, z: number) => {
        const xi = Math.floor(x),
          yi = Math.floor(y),
          zi = Math.floor(z),
          xf = x - xi,
          yf = y - yi,
          zf = z - zi;
        const u = xf * xf * (3 - 2 * xf),
          v = yf * yf * (3 - 2 * yf),
          w = zf * zf * (3 - 2 * zf);
        const l = (a: number, b: number, t: number) => a + (b - a) * t;
        return l(
          l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
          l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
          w,
        );
      };
      const land = (p: import('three').Vector3) =>
        0.58 * vnoise(p.x * 1.7 + 3, p.y * 1.7, p.z * 1.7) + 0.3 * vnoise(p.x * 3.6, p.y * 3.6 + 9, p.z * 3.6) + 0.12 * vnoise(p.x * 8, p.y * 8, p.z * 8 + 4) > 0.5;

      const N = 3400,
        GA = Math.PI * (3 - Math.sqrt(5));
      const L: number[] = [],
        O: number[] = [],
        C: number[] = [],
        landPts: import('three').Vector3[] = [];
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2,
          r = Math.sqrt(1 - y * y),
          th = GA * i;
        const p = new T.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
        if (land(p)) {
          L.push(p.x, p.y, p.z);
          landPts.push(p);
          if (rnd() < 0.035) C.push(p.x * 1.004, p.y * 1.004, p.z * 1.004);
        } else if (i % 4 === 0) O.push(p.x, p.y, p.z);
      }
      const dot = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d')!;
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, '#fff');
        gr.addColorStop(0.45, 'rgba(255,255,255,.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        return new T.CanvasTexture(c);
      })();
      const pts = (arr: number[], size: number, color: number, opacity: number) => {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
        const m = new T.PointsMaterial({ size, color, map: dot, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true });
        const o = new T.Points(g, m);
        globe.add(o);
        return o;
      };
      pts(O, 0.04, 0x5f6fff, 0.3);
      pts(L, 0.07, 0x9fb0ff, 1);
      pts(C, 0.14, 0xffb52e, 1);
      globe.add(new T.Mesh(new T.SphereGeometry(0.985, 48, 32), new T.MeshBasicMaterial({ color: 0x0a1040 })));
      // soft blue atmosphere around the rim
      scene.add(
        new T.Mesh(
          new T.SphereGeometry(1.09, 48, 32),
          new T.ShaderMaterial({
            transparent: true,
            side: T.BackSide,
            blending: T.AdditiveBlending,
            depthWrite: false,
            vertexShader: 'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader: 'varying vec3 n;void main(){float i=pow(max(0.,0.6-dot(n,vec3(0.,0.,1.))),3.);gl_FragColor=vec4(.3,.45,1.,1.)*i*1.7;}',
          }),
        ),
      );

      // pins: well-spread land points, one for each domain
      const pins: import('three').Vector3[] = [];
      for (const p of [...landPts].sort(() => rnd() - 0.5)) {
        if (pins.length >= DOMAINS.length) break;
        if (pins.every((q) => q.distanceTo(p) > 0.55)) pins.push(p);
      }
      const rings = pins.map((p) => {
        const m = new T.Mesh(
          new T.RingGeometry(0.03, 0.036, 40),
          new T.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }),
        );
        m.position.copy(p).multiplyScalar(1.006);
        m.lookAt(p.clone().multiplyScalar(3));
        globe.add(m);
        return m;
      });
      const pinDots = pins.map((p) => {
        const s = new T.Sprite(new T.SpriteMaterial({ map: dot, color: 0xffd27a, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        s.scale.setScalar(0.07);
        s.position.copy(p).multiplyScalar(1.01);
        globe.add(s);
        return s;
      });
      const arcs = Array.from({ length: 5 }, () => {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(49 * 3), 3));
        const m = new T.LineBasicMaterial({ color: 0xffc866, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
        const l = new T.Line(g, m);
        l.frustumCulled = false;
        globe.add(l);
        return { l, g, m, t: -rnd() * 4, a: 0, b: 0 };
      });
      const setArc = (A: (typeof arcs)[number], a: number, b: number) => {
        const pa = pins[a],
          pb = pins[b],
          pos = A.g.getAttribute('position') as import('three').BufferAttribute,
          d = pa.distanceTo(pb);
        for (let i = 0; i <= 48; i++) {
          const t = i / 48,
            v = pa
              .clone()
              .lerp(pb, t)
              .normalize()
              .multiplyScalar(1.004 + Math.sin(t * Math.PI) * d * 0.17);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        A.a = a;
        A.b = b;
      };

      const size = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(size);
      ro.observe(el);
      size();

      const mouse = { x: 0, y: 0 },
        aim = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        const b = el.getBoundingClientRect();
        aim.x = ((e.clientX - b.left) / b.width - 0.5) * 2;
        aim.y = ((e.clientY - b.top) / b.height - 0.5) * 2;
      };
      if (!still) addEventListener('pointermove', onMove, { passive: true });

      const live = pins.map((_, i) => -((i * 0.9) % 8) - 0.5); // seconds since this pin lit up, staggered at the start
      const v = new T.Vector3();
      let on = true,
        raf = 0,
        last = 0;
      const place = (showAll: boolean) => {
        const w = el.clientWidth,
          h = el.clientHeight;
        pins.forEach((p, i) => {
          const lab = labels.current[i];
          if (!lab) return;
          v.copy(p).multiplyScalar(1.02).applyMatrix4(globe.matrixWorld);
          const age = live[i],
            front = v.z > 0.25,
            show = front && (showAll ? i % 4 === 0 : age >= 0 && age < 3.6);
          v.project(camera);
          lab.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(10px,-50%)`;
          lab.style.opacity = show ? String(showAll ? 1 : Math.min(1, age * 3, (3.6 - age) * 3)) : '0';
        });
      };
      const frame = (now: number) => {
        raf = 0;
        if (!on || document.hidden) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        globe.rotation.y += dt * 0.09;
        mouse.x += (aim.x - mouse.x) * 0.04;
        mouse.y += (aim.y - mouse.y) * 0.04;
        globe.rotation.x = 0.38 + mouse.y * 0.1;
        camera.position.x = mouse.x * 0.25;
        camera.lookAt(0, 0, 0);
        pins.forEach((_, i) => {
          live[i] += dt;
          if (live[i] > 9 + (i % 4)) live[i] = 0;
          const a = live[i],
            rg = rings[i];
          if (a >= 0 && a < 2.2) {
            const k = a / 2.2;
            rg.scale.setScalar(1 + k * 5);
            (rg.material as import('three').MeshBasicMaterial).opacity = (1 - k) * 0.9;
          } else (rg.material as import('three').MeshBasicMaterial).opacity = 0;
          pinDots[i].scale.setScalar(0.06 + (a >= 0 && a < 0.8 ? (1 - a / 0.8) * 0.06 : 0));
        });
        arcs.forEach((A) => {
          A.t += dt;
          if (A.t > 5.5) {
            const a = Math.floor(rnd() * pins.length);
            let b = Math.floor(rnd() * pins.length);
            if (b === a) b = (a + 1) % pins.length;
            setArc(A, a, b);
            A.t = 0;
            live[a] = 0;
          }
          const g = A.g as import('three').BufferGeometry;
          const k = Math.min(1, Math.max(0, A.t / 1.6));
          g.setDrawRange(0, Math.max(2, Math.round(k * 49)));
          A.m.opacity = A.t < 0 ? 0 : A.t < 3.6 ? 0.75 : Math.max(0, 0.75 * (1 - (A.t - 3.6) / 1.6));
        });
        globe.updateMatrixWorld();
        place(false);
        renderer.render(scene, camera);
      };
      if (still) {
        globe.rotation.y = 0.9;
        globe.updateMatrixWorld();
        camera.updateMatrixWorld();
        place(true);
        renderer.render(scene, camera);
      } else {
        arcs.forEach((A, i) => setArc(A, i % pins.length, (i * 3 + 5) % pins.length));
        raf = requestAnimationFrame(frame);
      }
      const io = new IntersectionObserver(([e]) => {
        on = e.isIntersecting;
        if (on && !raf && !still) raf = requestAnimationFrame(frame);
      });
      io.observe(el);
      const vis = () => {
        if (!document.hidden && on && !raf && !still) raf = requestAnimationFrame(frame);
      };
      document.addEventListener('visibilitychange', vis);
      stop = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        removeEventListener('pointermove', onMove);
        document.removeEventListener('visibilitychange', vis);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      dead = true;
      stop();
    };
  }, []);

  return (
    <div className={'gl ' + (className ?? '')}>
      <div ref={host} className="gl-canvas" data-globe3d aria-hidden="true" />
      {fallback && <div className="gl-fb" aria-hidden="true" />}
      <div className="gl-labels" aria-hidden="true">
        {DOMAINS.map((d, i) => (
          <span
            key={d}
            ref={(n) => {
              labels.current[i] = n;
            }}
            className="gl-label"
          >
            <i />
            {d}
            <b>live</b>
          </span>
        ))}
      </div>
    </div>
  );
}
