// Additive, idempotent workspace migrations. Each runs only for workspaces created before `to`.
// Rule: never delete or overwrite user data; only add missing keys.
import fs from 'node:fs';
import path from 'node:path';
import { LITE_GATES_DEFAULT, SLICING_DEFAULTS, UX_DEFAULTS } from './lifecycle.mjs';
import { LEGACY_STATE_DIR, STATE_DIR, UserError, paths, readJson } from './state.mjs';

const gitignorePath = (ctx) => path.join(ctx.root, '.gitignore');
const LEGACY_IGNORE = `${LEGACY_STATE_DIR}/cache/`;
const NEW_IGNORE = `${STATE_DIR}/cache/`;

const FEATURE_FIELDS = ['kind', 'lane', 'parent', 'milestone', 'tags', 'origin', 'rework', 'size_waiver', 'checkpoint', 'dropped'];
const TOP_FIELDS = ['focus', 'parked', 'next_question', 'questions'];

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
  {
    to: '0.5.0',
    describe: 'Continuity and lean context: schema v2 (kinds, lanes, slices, focus, questions), memory.json, slicing and lane config',
    plan(ctx) {
      // Read the files as they are on disk: ctx is already normalized in memory.
      const p = paths(ctx.root);
      const raw = readJson(p.backlog, { features: [] });
      const out = [];
      if (raw.schema_version !== 2) out.push('backlog.schema_version = 2');
      if (ctx.config.schema_version !== 2) out.push('config.schema_version = 2');
      const missTop = TOP_FIELDS.filter((k) => raw[k] === undefined);
      if (missTop.length) out.push(`backlog top-level: ${missTop.join(', ')}`);
      const feats = (raw.features || []).filter((f) => FEATURE_FIELDS.some((k) => f[k] === undefined));
      if (feats.length) out.push(`${feats.length} feature record(s): add ${FEATURE_FIELDS.join(', ')} (defaults)`);
      if (ctx.config.current_milestone === undefined) out.push('config.current_milestone = null');
      if (!ctx.config.slicing) out.push(`config.slicing = max_tasks:${SLICING_DEFAULTS.max_tasks}, max_migrations:${SLICING_DEFAULTS.max_migrations}`);
      if (!ctx.config.lanes) out.push(`config.lanes.lite.gates = ${LITE_GATES_DEFAULT.join(', ')}`);
      if (!fs.existsSync(p.memory)) out.push(`create ${path.basename(p.specflow)}/memory.json (preferences, decisions, lessons)`);
      return out;
    },
    apply(ctx) {
      // ctx.backlog is already normalized by load(); saving it is the upgrade command's job.
      ctx.backlog.schema_version = 2;
      ctx.config.schema_version = 2;
      ctx.config.current_milestone ??= null;
      ctx.config.slicing ??= { ...SLICING_DEFAULTS };
      ctx.config.lanes ??= { lite: { gates: [...LITE_GATES_DEFAULT] } };
      if (!fs.existsSync(paths(ctx.root).memory)) ctx.saveMemory();
    },
  },
];
