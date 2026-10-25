import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashedStream } from '@/lib/delivery/serve';

/* Every download is logged once, also when it stops part way (evidence for disputes). */
const source = (chunks: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new Uint8Array(ch));
      c.close();
    },
  });

describe('hashedStream', () => {
  it('passes the file through and logs the full hash once', async () => {
    const logs: [string, number, boolean][] = [];
    const out = hashedStream(source([[1, 2], [3]]), 100, (h, b, c) => logs.push([h, b, c]));
    const got = new Uint8Array(await new Response(out).arrayBuffer());
    expect([...got]).toEqual([1, 2, 3]);
    expect(logs).toEqual([
      [
        createHash('sha256')
          .update(Buffer.from([1, 2, 3]))
          .digest('hex'),
        3,
        true,
      ],
    ]);
  });

  it('logs a cancelled download as partial with the bytes sent so far', async () => {
    const logs: [string, number, boolean][] = [];
    const out = hashedStream(source([[1, 2], [3, 4], [5]]), 100, (h, b, c) => logs.push([h, b, c]));
    const r = out.getReader();
    await r.read();
    await r.cancel();
    expect(logs).toHaveLength(1);
    expect(logs[0].slice(1)).toEqual([2, false]);
  });

  it('stops a file over the limit and logs it as partial', async () => {
    const logs: [string, number, boolean][] = [];
    const out = hashedStream(
      source([
        [1, 2],
        [3, 4],
      ]),
      3,
      (h, b, c) => logs.push([h, b, c]),
    );
    await expect(new Response(out).arrayBuffer()).rejects.toThrow();
    expect(logs).toHaveLength(1);
    expect(logs[0].slice(1)).toEqual([2, false]);
  });

  it('refuses to finish a file whose hash is not the scanned one, and logs it as partial', async () => {
    const logs: [string, number, boolean][] = [];
    const good = createHash('sha256')
      .update(Buffer.from([1, 2, 3]))
      .digest('hex');
    const ok = hashedStream(
      source([[1, 2], [3]]),
      100,
      (h, b, c) => logs.push([h, b, c]),
      (h) => h === good,
    );
    expect([...new Uint8Array(await new Response(ok).arrayBuffer())]).toEqual([1, 2, 3]);
    const swapped = hashedStream(
      source([[9, 9], [9]]),
      100,
      (h, b, c) => logs.push([h, b, c]),
      (h) => h === good,
    );
    await expect(new Response(swapped).arrayBuffer()).rejects.toThrow();
    expect(logs.map((l) => l[2])).toEqual([true, false]);
  });
});
