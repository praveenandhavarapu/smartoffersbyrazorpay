/**
 * Live Ray proxy (optional). Active only when ANTHROPIC_API_KEY is set on Netlify.
 * Adds the system prompt + tool schemas and calls the Claude Messages API. It never runs tools:
 * the browser executes them (engine and data live there) and sends tool_result blocks back.
 * Without a key it returns 503 and the browser falls back to demo mode.
 * Rate limit: ~30 merchant questions per hour per IP, in memory. It resets on cold start, so it is best-effort.
 */
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_SCHEMAS, MAX_OUTPUT_TOKENS } from '../../src/ray/toolSchemas';
import { systemPrompt } from '../../src/ray/systemPrompt';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const LIMIT_PER_HOUR = 30;
const MAX_MESSAGES = 60;
const hits = new Map<string, number[]>();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= LIMIT_PER_HOUR) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'Live mode is off (no API key). Using demo mode.' });

  let body: { messages?: Anthropic.Beta.BetaMessageParam[]; newTurn?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (!messages.length || messages[0].role !== 'user') return json(400, { error: 'messages must start with a user turn' });

  // Count merchant questions, not tool round trips.
  const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  if (body.newTurn && limited(ip)) return json(429, { error: 'Too many questions this hour. Demo mode still works.' });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: 'low' }, // short, tool-driven answers
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: systemPrompt('Alpha Apparel'), cache_control: { type: 'ephemeral' } }],
      tools: TOOL_SCHEMAS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as unknown as Anthropic.Beta.BetaTool.InputSchema })),
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return json(200, { content: [{ type: 'text', text: "I can't help with that one. Ask me about your offers, plan or results." }], stop_reason: 'end_turn' });
    }
    // Return the full content (including any thinking blocks) so the browser can echo it back unchanged.
    return json(200, { content: response.content, stop_reason: response.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'Model rate limited' });
    if (err instanceof Anthropic.APIError) return json(502, { error: `Model error ${err.status ?? ''}` });
    return json(502, { error: 'Upstream unavailable' });
  }
};
