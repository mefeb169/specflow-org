import { UserError, getFeature, getRepo, logHistory, repoDir } from '../lib/state.mjs';
import { EVIDENCE_KINDS } from '../lib/lifecycle.mjs';
import { headSha } from '../lib/git.mjs';
import { appendEvidence, runVerify, tail } from '../lib/verify.mjs';
import { emit, need } from './io.mjs';

export function cmdVerify(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'run') throw new UserError('usage: verify run <id> --repo r [--kind test|build|lint]');
  const f = getFeature(ctx, id);
  const repo = getRepo(ctx, need(args.flags.repo, '--repo required'));
  const kind = args.flags.kind || 'test';
  if (!['test', 'build', 'lint'].includes(kind)) throw new UserError('kind must be test, build or lint');
  const e = runVerify(ctx, f, repo, kind);
  logHistory(f, 'link', `verify ${kind} ${repo.name}: ${e.result}`);
  ctx.saveBacklog();
  emit(e, () => `${kind} on ${repo.name}: ${e.result.toUpperCase()} (exit ${e.exit_code}) at ${String(e.sha).slice(0, 8)}\n${e.tail.split('\n').slice(-8).join('\n')}`);
  if (e.result !== 'pass') process.exitCode = 1;
}

export function cmdEvidence(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'add') throw new UserError('usage: evidence add <id> --kind k [--repo r] --result pass|fail --note s');
  const f = getFeature(ctx, id);
  const kind = need(args.flags.kind, `--kind required (${EVIDENCE_KINDS.join('|')})`);
  if (!EVIDENCE_KINDS.includes(kind)) throw new UserError(`kind must be one of ${EVIDENCE_KINDS.join(', ')}`);
  const result = args.flags.result;
  if (!['pass', 'fail'].includes(result)) throw new UserError('--result must be pass or fail');
  let sha = '';
  if (args.flags.repo) sha = headSha(repoDir(ctx, getRepo(ctx, args.flags.repo))) || 'none';
  const e = appendEvidence(ctx, f, { kind, repo: args.flags.repo, result, note: typeof args.flags.note === 'string' ? args.flags.note : '', sha, tail: '' });
  logHistory(f, 'link', `evidence ${kind} ${result}`);
  ctx.saveBacklog();
  emit(e, `${f.id}: ${kind} evidence recorded (${result})`);
}

// ---------- views ----------
