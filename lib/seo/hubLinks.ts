/* The five template categories' names and addresses, small enough for the top bar (the full words are in hubs.ts; a test keeps the two in step). */
export const HUB_LINKS: [slug: string, name: string][] = [
  // ecommerce is the home page (/), the others are /templates/<slug>
  ['ecommerce', 'E-commerce Templates'],
  ['saas', 'SaaS & Startup Templates'],
  ['business', 'Business & Corporate Templates'],
  ['portfolio', 'Portfolio & Agency Templates'],
  ['industry', 'Industry Website Templates'],
];

export const hubLinkHref = (slug: string) => (slug === 'ecommerce' ? '/' : `/templates/${slug}`);
