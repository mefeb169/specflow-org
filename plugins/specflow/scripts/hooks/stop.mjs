import fs from 'node:fs';
import path from 'node:path';
import { open } from './common.mjs';
import { validate } from '../lib/validate.mjs';
import { writeHandoff } from '../lib/handoff.mjs';
import { handoffRel } from '../lib/state.mjs';
import { budgetCheck } from '../lib/session.mjs';

const o = open();
if (o) {
  try {
    const errors = validate(o.ctx);
    if (errors.length) process.stderr.write(`specflow validate found ${errors.length} problem(s):\n${errors.slice(0, 8).map((e) => ` - ${e}`).join('\n')}\n`);
  } catch { /* non-blocking in Phase 1 */ }
  // Keep the focus item's handoff current: regenerate it when state changed after it was written.
  try {
    const { ctx } = o;
    const f = ctx.backlog.focus && ctx.backlog.features.find((x) => x.id === ctx.backlog.focus);
    if (f) {
      const file = path.resolve(ctx.root, handoffRel(ctx, f));
      const last = f.history[f.history.length - 1];
      if (!fs.existsSync(file) || (last && Date.parse(last.at) > fs.statSync(file).mtimeMs)) writeHandoff(ctx, f);
    }
  } catch { /* best effort */ }
  // Session budget: past it, keep the PM going for one more turn to checkpoint and hand over to a fresh session.
  try {
    const reason = budgetCheck(o.ctx, o.input);
    if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  } catch { /* never break the session */ }
}
process.exit(0);
