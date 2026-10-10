/**
 * Live Ray (optional). The browser sends the chat to /.netlify/functions/ray, which adds the system
 * prompt and tool schemas and calls Claude. Tools run HERE in the browser (engine + data live here).
 * Any non-2xx / non-JSON response (no key -> 503, vite dev HTML, network error) returns null so the
 * caller falls back to demo mode silently.
 */
import { runTool, type Draft, type RayCtx, type ToolCall } from './tools';
import { MAX_TOOL_ROUNDS } from './toolSchemas';
import type { ToolName } from './toolSchemas';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } | { type: 'tool_result'; tool_use_id: string; content: string };
export type LiveMessage = { role: 'user' | 'assistant'; content: string | Block[] };

const ENDPOINT = '/.netlify/functions/ray';

async function post(messages: LiveMessage[], newTurn: boolean): Promise<{ content: Block[]; stop_reason: string } | null> {
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, newTurn }) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const data = (await res.json()) as { content?: Block[]; stop_reason?: string };
    return Array.isArray(data.content) ? { content: data.content, stop_reason: data.stop_reason ?? 'end_turn' } : null;
  } catch {
    return null;
  }
}

/** One merchant question. Returns null when live mode is unavailable. */
export async function askLive(history: LiveMessage[], question: string, ctx: RayCtx): Promise<{ text: string; drafts: Draft[]; toolCalls: ToolCall[]; history: LiveMessage[] } | null> {
  const messages: LiveMessage[] = [...history, { role: 'user', content: question }];
  const calls: ToolCall[] = [];
  const drafts: Draft[] = [];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const r = await post(messages, round === 0);
    if (!r) return null;
    messages.push({ role: 'assistant', content: r.content });
    const uses = r.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!uses.length || round === MAX_TOOL_ROUNDS) {
      const text = r.content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text: text || 'I could not finish that within my tool limit. Try a narrower question.', drafts, toolCalls: calls, history: messages };
    }
    const results: Block[] = uses.map((u) => {
      const result = runTool(ctx, u.name, u.input);
      calls.push({ name: u.name as ToolName, args: u.input, result });
      const d = (result as { draft?: Draft }).draft;
      if (d) drafts.push(d);
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result) };
    });
    messages.push({ role: 'user', content: results });
  }
  return null;
}
