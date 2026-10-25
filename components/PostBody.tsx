import Link from 'next/link';
import type { Block, Inline } from '@/lib/markdown';

/* Turns a parsed post (lib/markdown.ts) into elements. No raw HTML is ever written, so a post cannot inject markup. */
function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((n, i) => {
        switch (n.t) {
          case 'text':
            return n.v;
          case 'b':
            return (
              <strong key={i}>
                <Inlines c={n.c} />
              </strong>
            );
          case 'i':
            return (
              <em key={i}>
                <Inlines c={n.c} />
              </em>
            );
          case 'code':
            return <code key={i}>{n.v}</code>;
          case 'a':
            return n.external ? (
              <a key={i} className="link-u" href={n.href} rel="noopener noreferrer">
                <Inlines c={n.c} />
              </a>
            ) : (
              <Link key={i} className="link-u" href={n.href}>
                <Inlines c={n.c} />
              </Link>
            );
        }
      })}
    </>
  );
}

export function PostBody({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h2':
            return (
              <h2 key={i} id={b.id}>
                <Inlines c={b.c} />
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} id={b.id}>
                <Inlines c={b.c} />
              </h3>
            );
          case 'p':
            return (
              <p key={i}>
                <Inlines c={b.c} />
              </p>
            );
          case 'quote':
            return (
              <blockquote key={i}>
                <Inlines c={b.c} />
              </blockquote>
            );
          case 'ul':
          case 'ol': {
            const List = b.t;
            return (
              <List key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines c={it} />
                  </li>
                ))}
              </List>
            );
          }
          case 'img':
            // eslint-disable-next-line @next/next/no-img-element -- pictures in posts come from any https address the admin gives; next/image needs a fixed list of hosts
            return <img key={i} className="post-img" src={b.src} alt={b.alt} loading="lazy" decoding="async" />;
          case 'video':
            // YouTube and Vimeo players need scripts and their own origin inside the frame; the frame still cannot reach our page.
            return b.kind === 'embed' ? (
              <div key={i} className="post-video">
                <iframe
                  src={b.src}
                  title={b.title}
                  loading="lazy"
                  allow="encrypted-media; picture-in-picture; fullscreen"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <video key={i} className="post-video-file" src={b.src} title={b.title} controls preload="metadata" playsInline />
            );
          case 'hr':
            return <hr key={i} className="post-hr" />;
        }
      })}
    </>
  );
}
