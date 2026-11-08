import type { EmailPurpose } from './emailRouting';

/* The contact form's topics and who answers each (lib/emailRouting.ts). Safe in the browser. */
export const CONTACT_TOPICS = ['Buying a website', 'Payment or billing', 'Domain', 'Selling', 'Report a problem', 'Something else'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export const TOPIC_INBOX: Record<ContactTopic, EmailPurpose> = {
  'Buying a website': 'support',
  'Payment or billing': 'billing',
  Domain: 'support',
  Selling: 'business',
  'Report a problem': 'report',
  'Something else': 'support',
};
