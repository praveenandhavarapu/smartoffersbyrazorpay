/**
 * Live Ray proxy (optional). Active only when ANTHROPIC_API_KEY is set on Netlify.
 * GET  -> { configured, model }  (health check for the Live/Demo toggle; never reveals the key)
 * POST -> one Claude Messages API round. The function never runs tools: the browser executes them
 *         (engine and data live there) and sends tool_result blocks back.
 * Errors come back as JSON { error, detail } so the UI can show the real reason.
 * Rate limit: ~30 merchant questions per hour per IP, in memory (resets on cold start; best-effort).
 */
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_SCHEMAS, MAX_OUTPUT_TOKENS } from '../../src/ray/toolSchemas';
import { systemPrompt } from '../../src/ray/systemPrompt';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const LIMIT_PER_HOUR = 30;
const MAX_MESSAGES = 60;
// Netlify stops synchronous functions after ~10 s by default; give up a little earlier with a clear message.
const UPSTREAM_TIMEOUT_MS = 9000;
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
  if (req.method === 'GET') return json(200, { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
  if (req.method !== 'POST') return json(405, { error: 'Use GET or POST' });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'not_configured', detail: 'ANTHROPIC_API_KEY is not set for this deploy. Add it in Netlify → Environment variables, then redeploy.' });

  let body: { messages?: Anthropic.Beta.BetaMessageParam[]; newTurn?: boolean; merchant?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'bad_json', detail: 'Request body was not JSON.' }); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (!messages.length || messages[0].role !== 'user') return json(400, { error: 'bad_messages', detail: 'messages must start with a user turn' });

  const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  if (body.newTurn && limited(ip)) return json(429, { error: 'rate_limited', detail: 'About 30 questions an hour per visitor. Try again later or switch to Demo.' });

  // Sonnet 5.5: thinking only between tool calls keeps each round fast enough for Netlify's time limit.
  const thinking = MODEL.startsWith('claude-sonnet-5-5') ? { thinking: { type: 'between_tools' as const } } : {};
  const client = new Anthropic({ timeout: UPSTREAM_TIMEOUT_MS, maxRetries: 0 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: 'low' },
      ...thinking,
      system: [{ type: 'text', text: systemPrompt(typeof body.merchant === 'string' ? body.merchant.slice(0, 60) : 'Alpha Apparel'), cache_control: { type: 'ephemeral' } }],
      tools: TOOL_SCHEMAS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as unknown as Anthropic.Beta.BetaTool.InputSchema })),
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return json(200, { content: [{ type: 'text', text: "I can't help with that one. Ask me about your payments, settlements, offers or results." }], stop_reason: 'end_turn', model: response.model });
    }
    // Full content (including any thinking blocks) so the browser can echo it back unchanged.
    return json(200, { content: response.content, stop_reason: response.stop_reason, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: 'timeout', detail: `Claude took longer than ${UPSTREAM_TIMEOUT_MS / 1000} s (Netlify's function limit is about 10 s).` });
    if (err instanceof Anthropic.AuthenticationError) return json(502, { error: 'auth', detail: 'Anthropic rejected the API key. Check the key in Netlify → Environment variables.' });
    if (err instanceof Anthropic.PermissionDeniedError) return json(502, { error: 'permission', detail: `This key can't use ${MODEL}. Set ANTHROPIC_MODEL to a model your account can use.` });
    if (err instanceof Anthropic.NotFoundError) return json(502, { error: 'model', detail: `Model ${MODEL} was not found for this key. Set ANTHROPIC_MODEL in Netlify.` });
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'upstream_rate_limit', detail: 'Anthropic rate limit or no credit left on the key.' });
    if (err instanceof Anthropic.BadRequestError) return json(502, { error: 'bad_request', detail: err.message.slice(0, 300) });
    if (err instanceof Anthropic.APIError) return json(502, { error: 'upstream', detail: `Anthropic error ${err.status ?? ''}: ${err.message.slice(0, 200)}` });
    return json(502, { error: 'network', detail: 'Could not reach Anthropic.' });
  }
};
