// Setup interview: questions as data, apply answers, show what is answered.
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from '../lib/state.mjs';
import { addDecision } from '../lib/memory.mjs';
import { applyAnswers, setupQuestions, setupStatus } from '../lib/setup.mjs';
import { table } from '../lib/render.mjs';
import { emit } from './io.mjs';

const USAGE = 'usage: setup questions [--json] | setup apply --answers <file.json> | setup status';

export function cmdSetup(args, ctx) {
  const [sub] = args._;
  if (sub === 'questions') {
    const qs = setupQuestions(ctx);
    return emit(qs, () => qs.map((q, i) => [
      `${i + 1}. [${q.id}] ${q.text}`,
      q.options.length ? `   options: ${q.options.map((o) => o.value).join(' | ')}` : '   (free text)',
      `   default: ${q.default === null ? 'none' : q.default}`,
      `   why: ${q.why}`,
    ].join('\n')).join('\n'));
  }
  if (sub === 'apply') {
    const file = args.flags.answers;
    if (typeof file !== 'string') throw new UserError(USAGE);
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new UserError(`Answers file not found: ${file}`);
    let answers;
    try { answers = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { throw new UserError(`Answers file is not valid JSON: ${e.message}`); }
    const applied = applyAnswers(ctx, answers);
    for (const a of applied) addDecision(ctx, { question: a.question, answer: a.answer, scope: null, by: 'user' });
    ctx.saveConfig();
    ctx.saveMemory();
    return emit({ applied }, () => (applied.length ? [`Applied ${applied.length} answer(s), logged as decisions:`, ...applied.map((a) => `  ${a.id} = ${a.answer}`)].join('\n') : 'No answers given; nothing changed.'));
  }
  if (sub === 'status') {
    const rows = setupStatus(ctx);
    return emit(rows, () => table(rows.map((r) => ({ id: r.id, state: r.answered ? 'answered' : 'default', value: r.answered ? r.answer : r.default === null ? 'none' : r.default })), ['id', 'state', 'value']));
  }
  throw new UserError(USAGE);
}
