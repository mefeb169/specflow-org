import { open } from './common.mjs';
import { validate } from '../lib/validate.mjs';

const o = open();
if (o) {
  try {
    const errors = validate(o.ctx);
    if (errors.length) process.stderr.write(`sdlc validate found ${errors.length} problem(s):\n${errors.slice(0, 8).map((e) => ` - ${e}`).join('\n')}\n`);
  } catch { /* non-blocking in Phase 1 */ }
}
process.exit(0);
