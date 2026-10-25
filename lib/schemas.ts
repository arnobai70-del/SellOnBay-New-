import { z } from 'zod';
import { THIRD_PARTY_LICENCES } from './licences';
import { text } from './validate';

/* Input shapes for the API routes. Rules about who may do what stay in the routes. */

export const orderCreateSchema = z.object({
  kind: z.enum(['site', 'hire']).optional(),
  // hire
  dev: text(80).optional(),
  pack: text(30).optional(),
  brief: text(4000).optional(),
  // site
  productId: text(120).optional(),
  pkg: text(20).optional(),
  domainMode: text(10).optional(),
  own: text(300).optional(),
  domainName: text(120).optional(),
  ai: z.boolean().optional(),
  host: z.boolean().optional(),
  express: z.boolean().optional(),
  listing: z.boolean().optional(),
  appName: text(100).optional(),
  oses: z.array(text(20)).max(5).optional(),
  github: text(60).optional(),
});

export const paySchema = z.object({
  card: z.object({ number: text(30).optional(), exp: text(10).optional(), cvc: text(6).optional(), name: text(80).optional() }).optional(),
  otp: text(12).optional(),
});

export const hireSchema = z.object({ dev: text(80), pack: text(30), brief: text(4000) });

export const presaleSchema = z.object({
  productKey: text(120).optional(),
  body: text(4000).optional(),
  token: text(4000).optional(),
  hp: text(200).optional(),
  startedAt: z.number().finite().optional(),
});

export const replySchema = z.object({ id: text(120), reply: text(4000) });

export const extraSchema = z.object({ title: text(200), priceCents: z.number().int(), addDays: z.number().int() });

export const domainQuery = z.string().max(100);

export const developerSchema = z.object({
  name: text(200).optional(),
  headline: text(500).optional(),
  gig: text(500).optional(),
  country: text(200).optional(),
  bio: text(5000).optional(),
  avail: text(40).optional(),
  creditTrial: z.boolean().optional(),
  trialPrice: z.union([z.number().finite(), text(8)]).optional(),
  trialDays: z.union([z.number().finite(), text(4)]).optional(),
  langs: z.array(text(40)).max(60).optional(),
  areas: z.array(text(60)).max(60).optional(),
  skills: z
    .array(z.object({ name: text(60), level: text(30).optional() }))
    .max(40)
    .optional(),
  packs: z
    .array(
      z.object({
        price: z.union([z.number().finite(), text(12)]).optional(),
        days: z.union([z.number().finite(), text(12)]).optional(),
        blurb: text(500).optional(),
        features: z.array(text(300)).max(20).optional(),
      }),
    )
    .max(3)
    .optional(),
});

/* The listing form is multipart. Its text fields are checked here, the files are checked by their real bytes in the route. */
export const listingFieldsSchema = z.object({
  platform: z.enum(['web', 'android', 'ios', 'webapp', 'desktop', 'digital']),
  stack: text(60),
  name: text(200),
  category: text(80),
  desc: text(5000),
  license: text(2000),
  demo: text(500),
  code: text(1000),
  sample: text(1000),
  inc: text(5000),
  price: text(12),
  days: text(30),
  clean: text(10),
  release: text(10).optional(),
  licenceType: text(30).optional(),
  third: text(3000).optional(),
  delivery: text(20).optional(),
  express: text(4).optional(),
  docsUrl: text(500).optional(),
  requirements: text(2000).optional(),
  supportDays: text(4).optional(),
  updateDays: text(4).optional(),
  setupPrice: text(6).optional(),
  customPrice: text(6).optional(),
});

/* What is stored in products.third_party. */
export const thirdPartySchema = z.array(z.object({ name: z.string().trim().min(1).max(80), licence: z.enum(THIRD_PARTY_LICENCES) })).max(20);
