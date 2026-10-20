// Release configuration (steps, post-release checks, flags) and the release pipeline commands.
import { UserError, getFeature, getRepo } from '../lib/state.mjs';
import { RELEASE_APPROVALS, RELEASE_KINDS, releaseCfg, setReleaseByAi, stepApproval } from '../lib/team.mjs';
import { releasePlan, releaseRun, releaseVerify } from '../lib/release.mjs';
import { refreshHandoff } from '../lib/handoff.mjs';
import { table } from '../lib/render.mjs';
import { emit, need } from './io.mjs';

const USAGE = 'usage: release step add <name> --run "<cmd>" [--repo r --kind k --approval ask|none --timeout s --post] | release step rm <name> [--post] | release step list | release set --by-ai true|false | release set --require-merged true|false | release plan <id> | release run <id> [--step name] [--again] | release verify <id>';

const tf = (v, flag) => { if (!['true', 'false'].includes(String(v))) throw new UserError(`${flag} must be true or false`); return String(v) === 'true'; };

function list(ctx) {
  const r = releaseCfg(ctx);
  const steps = r.steps.map((s) => ({ name: s.name, repo: s.repo || '-', kind: s.kind || 'deploy', approval: stepApproval(s), timeout_s: s.timeout_s, run: s.run }));
  const post = r.post_release.map((s) => ({ name: s.name, repo: s.repo || '-', timeout_s: s.timeout_s, run: s.run }));
  emit({ by_ai: r.by_ai, require_merged: r.require_merged, steps, post_release: post }, () => [
    `release by AI: ${r.by_ai ? 'yes' : 'no'} | require merged PRs: ${r.require_merged ? 'yes' : 'no'}`,
    steps.length ? table(steps, ['name', 'repo', 'kind', 'approval', 'timeout_s', 'run']) : 'no release steps',
    post.length ? `post-release checks:\n${table(post, ['name', 'repo', 'timeout_s', 'run'])}` : 'no post-release checks',
  ].join('\n'));
}

function step(args, ctx) {
  const [, sub, name] = args._;
  const f = args.flags;
  if (sub === 'list') return list(ctx);
  need(name, USAGE);
  const post = !!f.post;
  const key = post ? 'post_release' : 'steps';
  const cfg = { ...releaseCfg(ctx) };
  const cur = [...cfg[key]];
  if (sub === 'add') {
    const run = need(typeof f.run === 'string' ? f.run : '', '--run "<command>" required');
    if (cur.some((s) => s.name === name)) throw new UserError(`${post ? 'post-release check' : 'step'} "${name}" already exists`);
    if (f.repo !== undefined) getRepo(ctx, String(f.repo));
    let timeout = post ? 120 : 900;
    if (f.timeout !== undefined) { timeout = Number(f.timeout); if (!Number.isInteger(timeout) || timeout < 1) throw new UserError('--timeout must be a whole number of seconds'); }
    const s = { name, ...(f.repo ? { repo: f.repo } : {}), run };
    if (!post) {
      const kind = f.kind === undefined ? 'deploy' : f.kind;
      const approval = f.approval === undefined ? 'ask' : f.approval;
      if (!RELEASE_KINDS.includes(kind)) throw new UserError(`--kind must be one of ${RELEASE_KINDS.join(', ')}`);
      if (!RELEASE_APPROVALS.includes(approval)) throw new UserError('--approval must be ask or none');
      Object.assign(s, { kind, approval });
    }
    s.timeout_s = timeout;
    cur.push(s);
  } else if (sub === 'rm') {
    if (!cur.some((s) => s.name === name)) throw new UserError(`unknown ${post ? 'post-release check' : 'step'} "${name}"`);
    cur.splice(cur.findIndex((s) => s.name === name), 1);
  } else throw new UserError(USAGE);
  cfg[key] = cur;
  ctx.config.release = cfg;
  ctx.saveConfig();
  list(ctx);
}

export function cmdRelease(args, ctx) {
  const [sub, id] = args._;
  const f = args.flags;
  if (!sub) return list(ctx);
  if (sub === 'step') return step(args, ctx);
  if (sub === 'set') {
    if (f['by-ai'] === undefined && f['require-merged'] === undefined) throw new UserError('give --by-ai true|false and/or --require-merged true|false');
    if (f['by-ai'] !== undefined) setReleaseByAi(ctx, tf(f['by-ai'], '--by-ai'));
    if (f['require-merged'] !== undefined) ctx.config.release = { ...releaseCfg(ctx), require_merged: tf(f['require-merged'], '--require-merged') };
    ctx.saveConfig();
    return list(ctx);
  }
  if (!['plan', 'run', 'verify'].includes(sub)) throw new UserError(USAGE);
  const item = getFeature(ctx, need(id, USAGE));
  const done = (data, text) => { ctx.saveBacklog(); refreshHandoff(ctx, item); emit(data, text); };
  if (sub === 'plan') { const p = releasePlan(ctx, item); return emit(p, () => `${p.text}\nWrote ${p.file}`); }
  if (sub === 'run') {
    const r = releaseRun(ctx, item, { step: typeof f.step === 'string' ? f.step : undefined, again: !!f.again });
    done(r, () => r.lines.join('\n'));
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const r = releaseVerify(ctx, item);
  done(r, () => r.lines.join('\n'));
  if (!r.ok) process.exitCode = 1;
}
