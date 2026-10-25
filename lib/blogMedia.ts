import 'server-only';
import { randomUUID } from 'node:crypto';
import { BUCKET } from './demoStore';
import { supabaseConfigured } from './supabase/env';
import { createAdminClient } from './supabase/server';

/*
 * Pictures uploaded in the post editor. They are kept in the private demos bucket under _blog/ with a name we choose, checked by
 * their real bytes (PNG, JPEG, WebP, GIF only: no SVG, which can carry scripts), and served from /blog/media/<name>.
 */
export const MAX_BYTES = 5 * 1024 * 1024;
const DIR = '_blog';
export const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export function sniff(b: Uint8Array): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  return null;
}

/* Uploads need the database and the server key; without them (demo mode) the editor still takes picture links. */
export const mediaReady = () => supabaseConfigured && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export const typeOfName = (name: string) => TYPES[name.slice(name.lastIndexOf('.') + 1)];

export async function saveBlogImage(bytes: Uint8Array): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ext = sniff(bytes);
  if (!ext) return { ok: false, error: 'Use a PNG, JPEG, WebP or GIF picture.' };
  const name = `${randomUUID()}.${ext}`;
  const { error } = await createAdminClient().storage.from(BUCKET).upload(`${DIR}/${name}`, bytes, { contentType: TYPES[ext], upsert: false });
  if (error) return { ok: false, error: 'Could not store the picture.' };
  return { ok: true, url: `/blog/media/${name}` };
}

export async function readBlogImage(name: string): Promise<Uint8Array | null> {
  if (!NAME.test(name)) return null;
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(`${DIR}/${name}`);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
