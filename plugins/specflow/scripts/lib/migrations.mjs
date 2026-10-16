// Additive, idempotent workspace migrations. Each runs only for workspaces created before `to`.
// Rule: never delete or overwrite user data; only add missing keys.
import fs from 'node:fs';
import path from 'node:path';
import { UX_DEFAULTS } from './lifecycle.mjs';
import { LEGACY_STATE_DIR, STATE_DIR, UserError } from './state.mjs';

const gitignorePath = (ctx) => path.join(ctx.root, '.gitignore');
const LEGACY_IGNORE = `${LEGACY_STATE_DIR}/cache/`;
const NEW_IGNORE = `${STATE_DIR}/cache/`;

export const MIGRATIONS = [
  {
    to: '0.2.0',
    describe: 'UI/UX support: add config.ux defaults',
    plan(ctx) { return ctx.config.ux ? [] : ['config.ux = design_gate_for_ui:true, require_ux_review:true']; },
    apply(ctx) { if (!ctx.config.ux) ctx.config.ux = { ...UX_DEFAULTS }; },
  },
  {
    to: '0.3.0',
    describe: 'Release hardening: guards.deny_in_unattended_modes, speckit.style',
    plan(ctx) {
      const out = [];
      if (ctx.config.guards && ctx.config.guards.deny_in_unattended_modes === undefined) out.push('config.guards.deny_in_unattended_modes = true');
      if (ctx.config.speckit && ctx.config.speckit.style === undefined) out.push('config.speckit.style (detected by `specflow doctor`)');
      return out;
    },
    apply(ctx) {
      if (ctx.config.guards && ctx.config.guards.deny_in_unattended_modes === undefined) ctx.config.guards.deny_in_unattended_modes = true;
      if (ctx.config.speckit && ctx.config.speckit.style === undefined) ctx.config.speckit.style = 'none';
    },
  },
  {
    to: '0.4.0',
    describe: 'Renamed to specflow: state dir .sdlc/ -> .specflow/, CLAUDE.md markers, .gitignore',
    plan(ctx) {
      const out = [];
      const legacy = fs.existsSync(path.join(ctx.root, LEGACY_STATE_DIR, 'config.json'));
      if (legacy && fs.existsSync(path.join(ctx.root, STATE_DIR))) out.push(`BLOCKED: both ${LEGACY_STATE_DIR}/ and ${STATE_DIR}/ exist; resolve by hand`);
      else if (legacy) out.push(`rename ${LEGACY_STATE_DIR}/ -> ${STATE_DIR}/ (backlog, config, cache and decisions move together)`);
      const gi = gitignorePath(ctx);
      if (fs.existsSync(gi) && fs.readFileSync(gi, 'utf8').split(/\r?\n/).includes(LEGACY_IGNORE)) out.push(`.gitignore: ${LEGACY_IGNORE} -> ${NEW_IGNORE}`);
      return out;
    },
    apply(ctx) {
      const from = path.join(ctx.root, LEGACY_STATE_DIR);
      const to = path.join(ctx.root, STATE_DIR);
      if (fs.existsSync(path.join(from, 'config.json'))) {
        if (fs.existsSync(to)) throw new UserError(`Both ${LEGACY_STATE_DIR}/ and ${STATE_DIR}/ exist; resolve by hand before upgrading.`);
        fs.renameSync(from, to);
      }
      const gi = gitignorePath(ctx);
      if (fs.existsSync(gi)) {
        const lines = fs.readFileSync(gi, 'utf8').split(/\r?\n/);
        if (lines.includes(LEGACY_IGNORE)) fs.writeFileSync(gi, lines.map((l) => (l === LEGACY_IGNORE ? NEW_IGNORE : l)).join('\n'));
      }
    },
  },
];
