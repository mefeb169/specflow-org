import { open } from './common.mjs';
import { writeHandoff } from '../lib/handoff.mjs';

// Regenerates the focus item's handoff before the context is compacted. Silent, and never fails the session.
const o = open();
if (o) {
  try {
    const f = o.ctx.backlog.focus && o.ctx.backlog.features.find((x) => x.id === o.ctx.backlog.focus);
    if (f) writeHandoff(o.ctx, f);
  } catch { /* best effort */ }
}
process.exit(0);
