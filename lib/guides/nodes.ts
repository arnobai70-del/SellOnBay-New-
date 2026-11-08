import { Extension, mergeAttributes, Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TextSelection } from '@tiptap/pm/state';

/*
 * The guides editor's own blocks (owner, 2026-11-08). Their HTML is exactly what lib/guides/html.ts lets through, and the guide page turns a
 * website card into the real listing at render time (live data, never copied into the guide).
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    guideBlocks: {
      setCallout: (tone?: 'info' | 'tip' | 'warn') => ReturnType;
      insertCta: (href: string, label: string) => ReturnType;
      insertGallery: (images: { src: string; alt: string }[]) => ReturnType;
      insertWebsite: (slug: string) => ReturnType;
      moveBlock: (dir: -1 | 1) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes: () => ({ tone: { default: 'info', parseHTML: (el) => el.getAttribute('data-tone') ?? 'info', renderHTML: (a) => ({ 'data-tone': a.tone }) } }),
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0],
  addCommands: () => ({
    setCallout:
      (tone = 'info') =>
      ({ commands }) =>
        commands.wrapIn('callout', { tone }),
  }),
});

export const Cta = Node.create({
  name: 'cta',
  group: 'block',
  atom: true,
  addAttributes: () => ({ href: { default: '/' }, label: { default: 'Learn more' } }),
  parseHTML: () => [{ tag: 'a[data-type="cta"]', getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute('href'), label: (el as HTMLElement).textContent }) }],
  renderHTML: ({ node }) => ['a', { 'data-type': 'cta', class: 'g-btn', href: node.attrs.href }, node.attrs.label],
  addCommands: () => ({
    insertCta:
      (href, label) =>
      ({ commands }) =>
        commands.insertContent({ type: 'cta', attrs: { href, label } }),
  }),
});

export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  addAttributes: () => ({ images: { default: [] as { src: string; alt: string }[] } }),
  parseHTML: () => [
    {
      tag: 'div[data-type="gallery"]',
      getAttrs: (el) => ({ images: [...(el as HTMLElement).querySelectorAll('img')].map((i) => ({ src: i.getAttribute('src') ?? '', alt: i.getAttribute('alt') ?? '' })) }),
    },
  ],
  renderHTML: ({ node }) => ['div', { 'data-type': 'gallery' }, ...(node.attrs.images as { src: string; alt: string }[]).map((i) => ['img', { src: i.src, alt: i.alt }])],
  addCommands: () => ({
    insertGallery:
      (images) =>
      ({ commands }) =>
        commands.insertContent({ type: 'gallery', attrs: { images } }),
  }),
});

export const WebsiteCard = Node.create({
  name: 'website',
  group: 'block',
  atom: true,
  addAttributes: () => ({ slug: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-type="website"]', getAttrs: (el) => ({ slug: (el as HTMLElement).getAttribute('data-slug') }) }],
  renderHTML: ({ node }) => ['div', { 'data-type': 'website', 'data-slug': node.attrs.slug }, `Website: ${node.attrs.slug}`],
  addCommands: () => ({
    insertWebsite:
      (slug) =>
      ({ commands }) =>
        commands.insertContent({ type: 'website', attrs: { slug } }),
  }),
});

/* A picture with alt text (required by the editor and the cleaner), a caption and a width (full, half or a quarter). */
export const Figure = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: '', parseHTML: (el) => el.getAttribute('title') ?? '', renderHTML: (a) => (a.caption ? { title: a.caption } : {}) },
      width: { default: '100', parseHTML: (el) => el.getAttribute('data-width') ?? '100', renderHTML: (a) => ({ 'data-width': a.width }) },
    };
  },
});

/* Move the block the cursor is in up or down (Alt+Up, Alt+Down, or the toolbar). */
export const BlockMove = Extension.create({
  name: 'blockMove',
  addCommands: () => ({
    moveBlock:
      (dir) =>
      ({ state, dispatch }) => {
        const doc = state.doc;
        const index = state.selection.$from.index(0);
        const target = index + dir;
        if (target < 0 || target >= doc.childCount) return false;
        const posOf = (i: number) => {
          let p = 0;
          for (let k = 0; k < i; k++) p += doc.child(k).nodeSize;
          return p;
        };
        const node = doc.child(index),
          other = doc.child(target);
        const tr = state.tr;
        if (dir === -1) tr.replaceWith(posOf(target), posOf(index) + node.nodeSize, [node, other]);
        else tr.replaceWith(posOf(index), posOf(target) + other.nodeSize, [other, node]);
        const at = dir === -1 ? posOf(target) : posOf(index) + other.nodeSize;
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + 1, tr.doc.content.size))));
        dispatch?.(tr.scrollIntoView());
        return true;
      },
  }),
  addKeyboardShortcuts() {
    return { 'Alt-ArrowUp': () => this.editor.commands.moveBlock(-1), 'Alt-ArrowDown': () => this.editor.commands.moveBlock(1) };
  },
});
