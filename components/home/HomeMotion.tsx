'use client';
import { useEffect } from 'react';

/*
 * The home page's whole motion layer, in one place: one passive scroll listener that schedules one requestAnimationFrame, which writes progress as
 * CSS custom properties (--p per pinned section, --f per flowing section, --k per stacked card, --q per panel, --sp for the steps line); CSS does the
 * rest with transform and opacity. IntersectionObserver handles the entrances, the looping illustrations and the count-up.
 * Every "hidden until it arrives" style is scoped under html.motion, which the root layout sets before paint only when motion is allowed, so
 * without JS, for crawlers and with reduced motion everything is simply visible and nothing is pinned.
 */
export function HomeMotion() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('motion') || typeof IntersectionObserver === 'undefined') return;
    const home = document.querySelector<HTMLElement>('.cine');
    if (!home) return;

    const scrubs = [...home.querySelectorAll<HTMLElement>('[data-scrub]')].map((el) => ({ el, cur: 0, tgt: 0 }));
    const show = home.querySelector<HTMLElement>('.hscroll');
    const track = show?.querySelector<HTMLElement>('.hs-track');
    const panels = [...home.querySelectorAll<HTMLElement>('.panel')];
    const cards = [...home.querySelectorAll<HTMLElement>('.stack .wcard')];
    const steps = home.querySelector<HTMLElement>('.cine-steps');
    const flows = [...home.querySelectorAll<HTMLElement>('.fx')];
    const clamp = (n: number) => Math.min(1, Math.max(0, n));

    const layout = () => {
      if (!show || !track) return;
      const dist = Math.max(0, track.scrollWidth - innerWidth);
      show.style.height = innerHeight + dist + 'px';
      show.style.setProperty('--dist', String(dist));
    };

    const measure = () => {
      const vh = innerHeight;
      for (const o of scrubs) {
        const r = o.el.getBoundingClientRect();
        o.tgt = clamp(-r.top / Math.max(1, r.height - vh));
      }
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        if (!next) return c.style.setProperty('--k', '0');
        const a = c.getBoundingClientRect();
        const b = next.getBoundingClientRect();
        c.style.setProperty('--k', clamp(1 - (b.top - a.top) / a.height).toFixed(3));
      });
      if (steps) steps.style.setProperty('--sp', clamp((vh * 0.85 - steps.getBoundingClientRect().top) / (vh * 0.5)).toFixed(3));
      for (const el of flows) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        el.style.setProperty('--f', clamp((vh - r.top) / (vh + r.height)).toFixed(3));
      }
      const cx = innerWidth / 2;
      for (const pn of panels) {
        const r = pn.getBoundingClientRect();
        const q = Math.max(-1, Math.min(1, (r.left + r.width / 2 - cx) / (innerWidth * 0.75)));
        pn.style.setProperty('--q', q.toFixed(3));
        pn.style.setProperty('--qa', Math.abs(q).toFixed(3));
      }
    };

    let running = false;
    let raf = 0;
    const tick = () => {
      measure();
      let moving = false;
      for (const o of scrubs) {
        const d = o.tgt - o.cur;
        if (Math.abs(d) > 0.0004) {
          o.cur += d * 0.14;
          moving = true;
        } else o.cur = o.tgt;
        o.el.style.setProperty('--p', o.cur.toFixed(4));
      }
      if (moving) raf = requestAnimationFrame(tick);
      else running = false;
    };
    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const resize = () => {
      layout();
      kick();
    };
    layout();
    kick();
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', resize);

    // Entrances: kicker, the heading rising out of its line, then the items one after another (the same move everywhere).
    for (const g of home.querySelectorAll<HTMLElement>('.stg')) [...g.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--d', String(i)));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reveal = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const t = e.target as HTMLElement;
          t.classList.add('in');
          reveal.unobserve(t);
          timers.push(setTimeout(() => t.querySelectorAll('.stg').forEach((x) => x.classList.add('done')), 1800));
        }),
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    );
    const reveals = [...home.querySelectorAll<HTMLElement>('[data-reveal]')];
    reveals.forEach((el) => reveal.observe(el));

    // Looping illustrations run only while they are on screen.
    const play = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('play', e.isIntersecting)), { threshold: 0.3 });
    home.querySelectorAll('[data-play]').forEach((el) => play.observe(el));

    // Figures count up once, from the value already in the HTML.
    const counted = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          counted.unobserve(e.target);
          const el = e.target as HTMLElement;
          const n = Number(el.dataset.count);
          const final = el.textContent ?? '';
          if (!Number.isFinite(n)) return;
          const t0 = performance.now();
          const step = (t: number) => {
            const p = Math.min(1, (t - t0) / 1400);
            el.textContent = p < 1 ? String(Math.round(n * (1 - Math.pow(1 - p, 3)))) : final;
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      { threshold: 0.4 },
    );
    home.querySelectorAll('[data-count]').forEach((el) => counted.observe(el));

    return () => {
      removeEventListener('scroll', kick);
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      reveal.disconnect();
      play.disconnect();
      counted.disconnect();
      reveals.forEach((el) => el.classList.add('in')); // never leave a section hidden
      if (show) show.style.height = '';
    };
  }, []);
  return null;
}
