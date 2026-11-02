/* The template categories that have their own accent colour (the [data-cat] rules in app/globals.css). The slugs are the hub slugs of lib/seo/hubs.ts. */
export const CAT_SLUGS = ['ecommerce', 'saas', 'business', 'portfolio', 'industry'] as const;
export type CatSlug = (typeof CAT_SLUGS)[number];

/* The data-cat value for a hub slug, or undefined for anything without a colour of its own (the default accent then applies). */
export const catAttr = (slug: string | undefined): CatSlug | undefined => ((CAT_SLUGS as readonly string[]).includes(slug ?? '') ? (slug as CatSlug) : undefined);

/* The category a menu link points at: the E-commerce hub is the home page (/), the others are /templates/<slug> (lib/seo/hubLinks.ts). */
export const catOfHref = (href: string): CatSlug | undefined => (href === '/' ? 'ecommerce' : catAttr(/^\/templates\/([^/?#]+)\/?$/.exec(href)?.[1]));
