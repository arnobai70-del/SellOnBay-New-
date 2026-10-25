import { NextResponse } from 'next/server';
import { z } from 'zod';

/*
 * Every route reads its input through a Zod schema from here. Shape and length are checked first; the route then applies its own rules
 * (who may do this, what it costs, the chat filter). A bad shape is a 400 with a plain message and the name of the field.
 */
export const idParam = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._~-]+$/);
export const tokenParam = z.string().min(10).max(4000);

/* A route id from the address. A bad one becomes '' which no order, product or listing has, so the route answers 404 as usual. */
export const idOf = async (params: Promise<{ id: string }>) => {
  const r = idParam.safeParse((await params).id);
  return r.success ? r.data : '';
};

const bad = (message: string, field?: string) => NextResponse.json({ error: message, ...(field ? { field } : {}) }, { status: 400 });
export type Parsed<T> = { ok: true; data: T } | { ok: false; res: NextResponse };

export function parseWith<S extends z.ZodType>(schema: S, value: unknown, message = 'That could not be read.'): Parsed<z.infer<S>> {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, res: bad(message, r.error.issues[0]?.path.join('.') || undefined) };
}

/* Reads a JSON body and checks it. With `allowEmpty` a missing body counts as an empty object. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, opts: { allowEmpty?: boolean } = {}): Promise<Parsed<z.infer<S>>> {
  const raw = await req.json().catch(() => (opts.allowEmpty ? {} : undefined));
  if (raw === undefined) return { ok: false, res: bad('That could not be read.') };
  return parseWith(schema, raw);
}

export const text = (max: number) => z.string().max(max);
