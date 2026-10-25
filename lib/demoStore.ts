import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'demos';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
};
export const typeOf = (path: string) => TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/* Replaces the hosted demo of a product with the given files. Uploads run a few at a time. */
export async function saveDemo(admin: SupabaseClient, productId: string, files: Record<string, Uint8Array>) {
  const names = Object.keys(files);
  await removeDemo(admin, productId);
  for (let i = 0; i < names.length; i += 8) {
    await Promise.all(
      names.slice(i, i + 8).map(async (name) => {
        const { error } = await admin.storage.from(BUCKET).upload(`${productId}/${name}`, files[name], { contentType: typeOf(name), upsert: true });
        if (error) throw new Error(`Could not store ${name}: ${error.message}`);
      }),
    );
  }
}

export async function removeDemo(admin: SupabaseClient, productId: string) {
  const walk = async (dir: string): Promise<string[]> => {
    const { data } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
    const out: string[] = [];
    for (const item of data ?? []) {
      if (item.id)
        out.push(`${dir}/${item.name}`); // a file
      else out.push(...(await walk(`${dir}/${item.name}`))); // a folder
    }
    return out;
  };
  const paths = await walk(productId);
  for (let i = 0; i < paths.length; i += 100) await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
}

export async function readDemoFile(admin: SupabaseClient, productId: string, path: string) {
  const { data, error } = await admin.storage.from(BUCKET).download(`${productId}/${path}`);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
