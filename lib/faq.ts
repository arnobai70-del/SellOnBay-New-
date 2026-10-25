import { FEE_CUSTOM_TEXT, FEE_SALE_TEXT } from './config';
/* One source for every FAQ on the site. Keep wording in line with the business rules in CLAUDE.md. */
export type Faq = { q: string; a: string };
export type FaqGroup = { title: string; items: Faq[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: 'Buying a site',
    items: [
      { q: 'Do I need to know how to code?', a: 'No. You choose a site and give us your domain. The seller deploys it and shows you how to change text and images.' },
      { q: 'Who owns the domain?', a: 'You do. The domain is registered in your name, and you can move it any time.' },
      { q: 'How long does it take?', a: 'Between 1 and 3 days from payment to a live site. An express option (24 hours) is available for an extra fee at checkout.' },
      { q: 'Can I change how it looks?', a: 'Yes. Ask the seller who built it. Brand swaps, extra pages and custom features have a fixed price that you pay into escrow before work starts.' },
    ],
  },
  {
    title: 'Money and safety',
    items: [
      {
        q: 'What if the site does not match the demo?',
        a: "Don't accept it. Open a dispute and our team reviews the delivery log, messages and the live site. If it doesn't match the listing, you get a refund.",
      },
      {
        q: 'Can I get a refund after I accept?',
        a: 'Accepting makes the order final, so check carefully during your 48-hour review. Problems with security, copyright or a site that stops working are still covered by our bug-fix guarantee for 7 days.',
      },
      {
        q: 'When do I get the source files?',
        a: 'As soon as your payment is in escrow, through a private download link that expires after 24 hours (you can ask for a new one). Sometimes a short safety check comes first. Your payment still goes to the seller only after you accept.',
      },
      {
        q: "Why can't we chat or pay outside SellOnBay?",
        a: 'Payments made outside are not protected. Messages with emails, phone numbers or outside payment requests are blocked, and repeat attempts can end in a ban.',
      },
    ],
  },
  {
    title: 'Selling a site',
    items: [
      { q: 'How do sellers get paid?', a: 'Every week we pay out all earnings that have been accepted for at least 7 days. You choose a bank transfer or Payoneer.' },
      {
        q: 'What does SellOnBay charge?',
        a: `We keep ${FEE_SALE_TEXT} of each sale and ${FEE_CUSTOM_TEXT} of custom, extra and trial work. Buyers pay no service fee. Domains and hosting are optional extras.`,
      },
      { q: 'Can I sell the same site again and again?', a: 'Yes, that is the idea. Each buyer gets a personal license and you keep ownership. Buyers may not resell or copy it.' },
      { q: 'How are listings checked?', a: 'We check for copied content, look at your files and make sure the demo works, and reply within 24 hours.' },
    ],
  },
];

export const TOP_FAQ: Faq[] = [FAQ_GROUPS[1].items[0], FAQ_GROUPS[1].items[3], FAQ_GROUPS[2].items[1]];
