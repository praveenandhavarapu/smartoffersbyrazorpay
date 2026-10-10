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

/** The key as Netlify stores it, minus stray spaces, newlines or quotes from copy-paste. */
function readKey(): { key: string; cleaned: boolean; hint: { starts_with: string; length: number } } {
  const raw = process.env.ANTHROPIC_API_KEY ?? '';
  // Remove invisible characters, then pull out the key itself if it was pasted with extras
  // ("ANTHROPIC_API_KEY=…", "Bearer …", quotes, spaces, line breaks).
  const visible = raw.replace(/[\u200B-\u200D\u2060\uFEFF\s]/g, '');
  const found = visible.match(/sk-ant-[A-Za-z0-9_-]+/);
  const key = found ? found[0] : visible.replace(/^["']+|["']+$/g, '');
  // Safe diagnostic: the first 4 visible characters and the length only, never the key.
  return { key, cleaned: key !== raw, hint: { starts_with: visible.slice(0, 4), length: visible.length } };
}

/** Shape only (never the value): a Console API key starts with sk-ant-api. */
function keyFormat(key: string): 'api_key' | 'admin_key' | 'oauth_token' | 'unknown' | 'missing' {
  if (!key) return 'missing';
  if (key.startsWith('sk-ant-api')) return 'api_key';
  if (key.startsWith('sk-ant-admin')) return 'admin_key';
  if (key.startsWith('sk-ant-oat')) return 'oauth_token';
  return 'unknown';
}

const FORMAT_HELP: Record<string, string> = {
  admin_key: 'This is an Admin key (sk-ant-admin…). Ray needs a normal API key: console.anthropic.com → API keys → Create key (it starts with sk-ant-api).',
  oauth_token: 'This looks like a Claude subscription/OAuth token (sk-ant-oat…), not an API key. Create one at console.anthropic.com → API keys (it starts with sk-ant-api).',
  unknown: 'The value does not look like an Anthropic API key (they start with sk-ant-). Paste the full key from console.anthropic.com → API keys.',
};

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
  const { key, cleaned, hint } = readKey();
  const format = keyFormat(key);
  const blocked = format === 'missing' || format === 'admin_key' || format === 'oauth_token';
  if (req.method === 'GET') {
    const base = { configured: format !== 'missing', model: MODEL, key_format: format, key_was_cleaned: cleaned, key_hint: hint };
    if (blocked || !new URL(req.url).searchParams.has('verify')) return json(200, base);
    // Cheap check that Anthropic accepts the key (no tokens used): look up the model.
    try {
      await new Anthropic({ apiKey: key, timeout: 5000, maxRetries: 0 }).models.retrieve(MODEL);
      return json(200, { ...base, verified: true });
    } catch (err) {
      const reason = err instanceof Anthropic.AuthenticationError
        ? (format === 'unknown' ? FORMAT_HELP.unknown + ` (Netlify's value starts with "${hint.starts_with}" and is ${hint.length} characters long.)` : 'Anthropic rejected this key (401). Create a new key at console.anthropic.com → API keys, paste it in Netlify, then redeploy.')
        : err instanceof Anthropic.NotFoundError || err instanceof Anthropic.PermissionDeniedError ? `The key works but cannot use ${MODEL}. Set ANTHROPIC_MODEL in Netlify to a model your account has.`
        : 'Could not verify the key right now.';
      return json(200, { ...base, verified: false, reason });
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'Use GET or POST' });
  if (format === 'missing') return json(503, { error: 'not_configured', detail: 'ANTHROPIC_API_KEY is not set for this deploy. Add it in Netlify → Environment variables, then redeploy.' });
  if (blocked) return json(502, { error: 'key_format', detail: FORMAT_HELP[format] });

  let body: { messages?: Anthropic.Beta.BetaMessageParam[]; newTurn?: boolean; merchant?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'bad_json', detail: 'Request body was not JSON.' }); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (!messages.length || messages[0].role !== 'user') return json(400, { error: 'bad_messages', detail: 'messages must start with a user turn' });

  const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  if (body.newTurn && limited(ip)) return json(429, { error: 'rate_limited', detail: 'About 30 questions an hour per visitor. Try again later or switch to Demo.' });

  // Sonnet 5.5: thinking only between tool calls keeps each round fast enough for Netlify's time limit.
  const thinking = MODEL.startsWith('claude-sonnet-5-5') ? { thinking: { type: 'between_tools' as const } } : {};
  const client = new Anthropic({ apiKey: key, timeout: UPSTREAM_TIMEOUT_MS, maxRetries: 0 });
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
    if (err instanceof Anthropic.AuthenticationError) return json(502, { error: 'auth', detail: 'Anthropic rejected the API key (401). Create a new key at console.anthropic.com → API keys, replace the value in Netlify, then trigger a new deploy (keys only apply after a deploy).' });
    if (err instanceof Anthropic.PermissionDeniedError) return json(502, { error: 'permission', detail: `This key can't use ${MODEL}. Set ANTHROPIC_MODEL to a model your account can use.` });
    if (err instanceof Anthropic.NotFoundError) return json(502, { error: 'model', detail: `Model ${MODEL} was not found for this key. Set ANTHROPIC_MODEL in Netlify.` });
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'upstream_rate_limit', detail: 'Anthropic rate limit or no credit left on the key.' });
    if (err instanceof Anthropic.BadRequestError) return json(502, { error: 'bad_request', detail: err.message.slice(0, 300) });
    if (err instanceof Anthropic.APIError) return json(502, { error: 'upstream', detail: `Anthropic error ${err.status ?? ''}: ${err.message.slice(0, 200)}` });
    return json(502, { error: 'network', detail: 'Could not reach Anthropic.' });
  }
};
