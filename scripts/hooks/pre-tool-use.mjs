import { open } from './common.mjs';
import { decide } from '../lib/guard.mjs';

const o = open();
if (o) {
  let d = null;
  try {
    d = decide({ root: o.ctx.root, config: o.ctx.config, backlog: o.ctx.backlog, input: o.input, cwd: o.input.cwd });
  } catch { d = null; } // never break the user's session on a hook bug
  if (d) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: d.decision, permissionDecisionReason: d.reason } }));
  }
}
