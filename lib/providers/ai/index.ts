import { generateIdeas } from '../../tools/siteIdeas';

/*
 * The one door to an AI model (decision K: the key comes from the owner). Every call goes through it with per-visitor and global daily caps, a
 * monthly budget switch, a saved answer for identical inputs (lib/tools/run.ts), and it never receives secrets, other people's private data or payment details.
 * Only a local stand-in exists today. To go live, write a class that implements AiProvider with a small cheap model, read the provider's current docs
 * first, give it a timeout and a fallback model, and return it from aiProvider().
 */
export interface AiProvider {
  readonly name: string;
  complete(i: { feature: string; prompt: string; maxTokens: number; userKey: string }): Promise<{ text: string; tokensIn: number; tokensOut: number }>;
}

/* Test double: answers with a fixed text and counts calls. */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  calls = 0;
  async complete(i: { prompt: string }) {
    this.calls++;
    return { text: 'fake answer', tokensIn: Math.ceil(i.prompt.length / 4), tokensOut: 3 };
  }
}

/* The stand-in used until a real model is connected: answers the site-ideas tool from templates, in the same JSON shape a model would be asked for. */
export class LocalAiProvider implements AiProvider {
  readonly name = 'local';
  calls = 0;
  async complete(i: { feature: string; prompt: string }) {
    this.calls++;
    const text = i.feature === 'site-ideas' ? JSON.stringify(generateIdeas(i.prompt)) : '{}';
    return { text, tokensIn: Math.ceil(i.prompt.length / 4), tokensOut: Math.ceil(text.length / 4) };
  }
}

const local = ((globalThis as { __localAi?: LocalAiProvider }).__localAi ??= new LocalAiProvider());
/* The one line to change when a real model is chosen. */
export const aiProvider = (): AiProvider => local;
