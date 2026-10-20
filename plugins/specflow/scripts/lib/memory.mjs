// Project memory (.specflow/memory.json): preferences, decisions, lessons. Saving is the caller's job.
import { now } from './state.mjs';

const nextId = (list, prefix) => `${prefix}-${list.reduce((m, x) => Math.max(m, parseInt(String(x.id).split('-')[1], 10) || 0), 0) + 1}`;

export function addDecision(ctx, { question, answer, scope, by }) {
  const d = { id: nextId(ctx.memory.decisions, 'D'), at: now(), question, answer, scope: scope || 'project', by: by || 'user' };
  ctx.memory.decisions.push(d);
  return d;
}

export function addLesson(ctx, { text, from }) {
  const l = { id: nextId(ctx.memory.lessons, 'L'), at: now(), text, from: from || null, status: 'proposed' };
  ctx.memory.lessons.push(l);
  return l;
}
