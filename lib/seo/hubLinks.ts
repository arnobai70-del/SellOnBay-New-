/* The five template categories' names and addresses, small enough for the top bar (the full words are in hubs.ts; a test keeps the two in step). */
export const HUB_LINKS: [slug: string, name: string][] = [
  // ecommerce is the home page (/), the others are /templates/<slug>
  ['ecommerce', 'E-commerce Websites'],
  ['saas', 'SaaS & Startup Websites'],
  ['business', 'Business & Corporate Websites'],
  ['portfolio', 'Portfolio & Agency Websites'],
  ['industry', 'Industry Websites'],
];

export const hubLinkHref = (slug: string) => `/websites/category/${slug}`;
