// Additive, idempotent workspace migrations. Each runs only for workspaces created before `to`.
// Rule: never delete or overwrite user data; only add missing keys.
import { UX_DEFAULTS } from './lifecycle.mjs';

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
      if (ctx.config.speckit && ctx.config.speckit.style === undefined) out.push('config.speckit.style (detected by `sdlc doctor`)');
      return out;
    },
    apply(ctx) {
      if (ctx.config.guards && ctx.config.guards.deny_in_unattended_modes === undefined) ctx.config.guards.deny_in_unattended_modes = true;
      if (ctx.config.speckit && ctx.config.speckit.style === undefined) ctx.config.speckit.style = 'none';
    },
  },
];
