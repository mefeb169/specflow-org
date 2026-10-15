import { open } from './common.mjs';
import { brief } from '../lib/render.mjs';

const o = open();
if (o) {
  let text;
  try { text = brief(o.ctx).join('\n'); } catch (e) { text = `SDLC brief unavailable: ${e.message}`; }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
}
