import { mediaReady, readBlogImage, typeOfName } from '@/lib/blogMedia';

/* Serves a picture uploaded in the post editor (lib/blogMedia.ts). Names are random and never reused, so they can be cached for long. */
const nf = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!mediaReady()) return nf();
  const bytes = await readBlogImage(name);
  if (!bytes) return nf();
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': typeOfName(name),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
