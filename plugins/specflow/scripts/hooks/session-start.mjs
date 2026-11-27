import { open } from './common.mjs';
import { brief } from '../lib/render.mjs';
import { markSessionStart } from '../lib/session.mjs';

const o = open();
if (o) {
  try { markSessionStart(o.ctx, o.input); } catch { /* best effort */ }
  let text;
  try { text = brief(o.ctx).join('\n'); } catch (e) { text = `specflow brief unavailable: ${e.message}`; }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
}
