'use client';
import { useEffect, useRef, useState } from 'react';
import { CrystalLogo } from './CrystalLogo';

/*
 * The SellOnBay "L" as a real 3D glass object (WebGL via three.js). It spins slowly, follows the pointer, and only renders while
 * it is on screen. If WebGL is missing, or the visitor asked for less motion, the flat CSS crystal takes its place.
 */
export function Crystal3D({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFallback(true);
      return;
    }

    let stop = () => {};
    let cancelled = false;
    (async () => {
      let THREE: typeof import('three');
      let RoomEnvironment: typeof import('three/examples/jsm/environments/RoomEnvironment.js').RoomEnvironment;
      try {
        THREE = await import('three');
        ({ RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js'));
      } catch {
        if (!cancelled) setFallback(true);
        return;
      }
      if (cancelled) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      } catch {
        setFallback(true);
        return;
      }

      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0, 11);

      // The L: a thick bevelled extrusion, so light catches real edges.
      const shape = new THREE.Shape();
      const pts: [number, number][] = [
        [-2, 2.6],
        [-0.2, 2.6],
        [-0.2, -0.7],
        [2.2, -0.7],
        [2.2, -2.6],
        [-2, -2.6],
      ];
      shape.moveTo(...pts[0]);
      pts.slice(1).forEach((p) => shape.lineTo(...p));
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.24, bevelSegments: 5, curveSegments: 1 });
      geo.center();
      // Mirror-like icy metal with a thin-film shimmer: it reflects the room, so light and dark facets read as cut crystal.
      const glass = new THREE.MeshPhysicalMaterial({
        color: 0xa9b6ff,
        metalness: 0.9,
        roughness: 0.15,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        iridescence: 0.85,
        iridescenceIOR: 1.4,
        iridescenceThicknessRange: [150, 520],
        envMapIntensity: 1.3,
        flatShading: true,
      });
      const group = new THREE.Group();
      const body = new THREE.Mesh(geo, glass);
      group.add(body);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      group.add(edges);
      // Gold gem set into the corner of the foot, the brand's one warm accent.
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.62, 0),
        new THREE.MeshPhysicalMaterial({ color: 0xffb52e, metalness: 0.2, roughness: 0.12, clearcoat: 1, envMapIntensity: 1.6, flatShading: true }),
      );
      gem.position.set(1.55, -1.55, 0.9);
      group.add(gem);
      group.scale.setScalar(0.92);
      scene.add(group);
      scene.add(new THREE.DirectionalLight(0xffffff, 1.4).translateX(4).translateY(5).translateZ(6));

      const size = () => {
        const w = el.clientWidth || 300,
          h = el.clientHeight || 300;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      size();
      const ro = new ResizeObserver(size);
      ro.observe(el);

      // Pointer position anywhere over the page area nudges the object; it eases back to a slow spin when idle.
      let px = 0,
        py = 0,
        tx = 0,
        ty = 0,
        onScreen = true,
        raf = 0,
        frame = 0;
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        tx = ((e.clientX - (r.left + r.width / 2)) / innerWidth) * 2;
        ty = ((e.clientY - (r.top + r.height / 2)) / innerHeight) * 2;
      };
      addEventListener('pointermove', move, { passive: true });
      const io = new IntersectionObserver(
        ([e]) => {
          onScreen = e.isIntersecting;
        },
        { threshold: 0.05 },
      );
      io.observe(el);

      const t0 = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (!onScreen || document.hidden) return;
        if (++frame % 20 === 0 && getComputedStyle(el).visibility === 'hidden') return; // hidden hero slide
        px += (tx - px) * 0.06;
        py += (ty - py) * 0.06;
        const t = (now - t0) / 1000;
        group.rotation.y = Math.sin(t * 0.5) * 0.55 + px * 0.9;
        group.rotation.x = Math.sin(t * 0.37) * 0.12 - py * 0.6;
        group.position.y = Math.sin(t * 1.1) * 0.12;
        gem.rotation.y = t * 0.9;
        gem.rotation.x = t * 0.5;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      stop = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        removeEventListener('pointermove', move);
        geo.dispose();
        glass.dispose();
        gem.geometry.dispose();
        (gem.material as import('three').Material).dispose();
        edges.geometry.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  if (fallback)
    return (
      <div className={className}>
        <CrystalLogo />
      </div>
    );
  return <div ref={host} className={className} data-crystal3d />;
}
