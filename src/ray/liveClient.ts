/**
 * Live Ray. The browser sends the chat to /.netlify/functions/ray, which adds the system prompt and
 * tool schemas and calls Claude. Tools run HERE in the browser (engine + data live here).
 * Failures come back with a reason so the UI can show it and answer in demo mode for that message.
 */
import { runTool, type RayCtx, type ToolCall } from './tools';
import { MAX_TOOL_ROUNDS } from './toolSchemas';
import type { ToolName } from './toolSchemas';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: string; [k: string]: unknown };
export type LiveMessage = { role: 'user' | 'assistant'; content: string | Block[] };

const ENDPOINT = '/.netlify/functions/ray';
const CLIENT_TIMEOUT_MS = 15000;

export type Health = { state: 'ready'; model: string } | { state: 'off'; reason: string };

/** GET health: is the function deployed and does it have a key? */
export async function checkHealth(): Promise<Health> {
  try {
    const res = await fetch(ENDPOINT, { method: 'GET', headers: { accept: 'application/json' } });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { state: 'off', reason: 'The live function is not deployed here (local preview or pull-request link).' };
    const data = (await res.json()) as { configured?: boolean; model?: string };
    if (!data.configured) return { state: 'off', reason: 'No ANTHROPIC_API_KEY on this deploy. Add it in Netlify and redeploy.' };
    return { state: 'ready', model: data.model ?? 'Claude' };
  } catch {
    return { state: 'off', reason: 'Could not reach the live function.' };
  }
}

type Round = { ok: true; content: Block[]; model?: string } | { ok: false; reason: string };

async function post(messages: LiveMessage[], newTurn: boolean, merchant: string): Promise<Round> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, newTurn, merchant }), signal: ctrl.signal });
    const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
    if (!isJson) return { ok: false, reason: res.status === 404 ? 'Live function not found on this deploy.' : `Live function returned HTTP ${res.status} (${res.status >= 500 ? 'likely Netlify\'s 10-second limit' : 'not JSON'}).` };
    const data = (await res.json()) as { content?: Block[]; detail?: string; error?: string; model?: string };
    if (!res.ok || !Array.isArray(data.content)) return { ok: false, reason: data.detail ?? data.error ?? `HTTP ${res.status}` };
    return { ok: true, content: data.content, model: data.model };
  } catch (e) {
    return { ok: false, reason: e instanceof DOMException && e.name === 'AbortError' ? 'Live answer took too long.' : 'Network error reaching the live function.' };
  } finally {
    clearTimeout(timer);
  }
}

export type LiveAnswer = { ok: true; text: string; toolCalls: ToolCall[]; history: LiveMessage[]; model?: string } | { ok: false; reason: string };

/** One merchant question: up to MAX_TOOL_ROUNDS tool rounds. */
export async function askLive(history: LiveMessage[], question: string, ctx: RayCtx): Promise<LiveAnswer> {
  const messages: LiveMessage[] = [...history, { role: 'user', content: question }];
  const calls: ToolCall[] = [];
  let model: string | undefined;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const r = await post(messages, round === 0, ctx.model.profile.displayName);
    if (!r.ok) return r;
    model = r.model ?? model;
    messages.push({ role: 'assistant', content: r.content });
    const uses = r.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use' && typeof (b as { id?: unknown }).id === 'string');
    if (!uses.length || round === MAX_TOOL_ROUNDS) {
      const text = r.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof (b as { text?: unknown }).text === 'string').map((b) => b.text).join('\n').trim();
      return { ok: true, text: text || 'I could not finish that within my tool limit. Try a narrower question.', toolCalls: calls, history: messages, model };
    }
    const results: Block[] = uses.map((u) => {
      const result = runTool(ctx, u.name, u.input ?? {});
      calls.push({ name: u.name as ToolName, args: u.input ?? {}, result });
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result) };
    });
    messages.push({ role: 'user', content: results });
  }
  return { ok: false, reason: 'No answer.' };
}
