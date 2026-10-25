import { readDemoFile, typeOf } from '@/lib/demoStore';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { mayViewUnreleased } from '@/lib/supabase/viewer';

/*
 * Serves a seller's uploaded demo site. The files are untrusted, so every response carries
 * `Content-Security-Policy: sandbox ...` WITHOUT allow-same-origin: the page runs as a throwaway origin and cannot read our
 * cookies, storage or session even though it is served from our domain. The same header applies if someone opens a file directly.
 */
const SANDBOX = 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals';
const nf = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path } = await params;
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return nf();

  const admin = createAdminClient();
  const { data: p } = await admin.from('products').select('id, slug, seller_id, status, demo_path, demo_entry').eq('slug', id).maybeSingle();
  if (!p) return nf();

  const live = p.status === 'live';
  if (!live && !(await mayViewUnreleased(p.seller_id))) return nf();

  let rel = (path ?? []).join('/');
  if (rel.includes('\0') || rel.split('/').some((s) => s === '..' || s.startsWith('.'))) return nf();

  // shots/ paths are served even when the seller gave a demo_url instead of uploading a zip
  const isShot = rel.startsWith('shots/');
  if (!isShot && !p.demo_path) return nf();
  if (!rel) rel = p.demo_entry;

  let bytes = await readDemoFile(admin, p.id, rel);
  if (!bytes && !/\.[a-z0-9]+$/i.test(rel)) {
    const dir = rel.replace(/\/$/, '') + '/index.html';
    bytes = await readDemoFile(admin, p.id, dir);
    if (bytes) rel = dir;
  }
  if (!bytes) return nf();

  const type = typeOf(rel);
  const base = `/demo/${p.slug}/`;
  let body: BodyInit = bytes as unknown as BodyInit;
  if (type.startsWith('text/html')) {
    let html = new TextDecoder().decode(bytes);
    // Relative links work thanks to <base>. Root-absolute links ("/css/app.css") would escape to our site, so point them back into the demo.
    html = html.replace(/(\s(?:src|href|action|poster)=)(["'])\/(?!\/)/gi, `$1$2${base}`);
    if (!/<base[\s>]/i.test(html)) html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${base}">`) : `<base href="${base}">${html}`;
    body = html;
  } else if (type.startsWith('text/css')) {
    body = new TextDecoder().decode(bytes).replace(/url\(\s*(["']?)\/(?!\/)/gi, `url($1${base}`);
  }

  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Security-Policy': SANDBOX,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': live ? 'public, max-age=120, s-maxage=300' : 'private, no-store',
    },
  });
}
