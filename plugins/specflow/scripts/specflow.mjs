#!/usr/bin/env node
// specflow CLI dispatcher: the only sanctioned way to mutate lifecycle state. Zero dependencies.
import path from 'node:path';
import { UserError, findRoot, load, requireRoot } from './lib/state.mjs';
import { brief } from './lib/render.mjs';
import { MIN_NODE, frameworkVersion, nodeOk } from './lib/runtime.mjs';
import { emit, io, parseArgs } from './commands/io.mjs';
import { cmdInit, cmdScan, doctor, renderDoctor } from './commands/init.mjs';
import { cmdBlocker, cmdDep, cmdFeature, cmdRepo } from './commands/feature.mjs';
import { cmdBranches, cmdCheck, cmdGate, cmdStage } from './commands/stage.mjs';
import { cmdEvidence, cmdVerify } from './commands/verify.mjs';
import { cmdNext, cmdStatus, cmdValidate } from './commands/views.mjs';
import { cmdSlice } from './commands/work.mjs';
import { cmdUpgrade } from './commands/upgrade.mjs';
import { cmdInstall, cmdUninstall } from './commands/install.mjs';

const HELP = `specflow <command>   (alias: sflow)
  init [--root-is-repo] | scan | doctor | validate | brief | status [id] | next | upgrade [--apply]
  install [--scope project|user|local] [--dir path] [--source path|owner/repo] [--fix-legacy] | uninstall [--scope s] [--dir path] [--remove-marketplace]
  --version
  repo set <name> [--test c --build c --lint c --purpose s --stack a,b --ui true|false --confirm --deploy-order n]
  feature add --title s [--priority P2 --mvp --repos a,b --summary s --value s --risk low|med|high --ui true|false]
  feature set|link|activate <id> ...   slice add <feature> --title s [--repos a,b --summary s --value s]
  check tasks|size <id>   feature set <id> lane full|lite | size_waiver "<reason>"
    dep add|rm <id> <dep> --type t   blocker add|resolve <id> ...
  stage set <id> <stage> [--reason s]  gate approve|required <id> [gate]  check tasks <id>
  branches create <id>  verify run <id> --repo r [--kind k]  evidence add <id> --kind k --result r --note s
All commands accept --json.`;


function main() {
  if (!nodeOk()) throw new UserError(`specflow requires Node.js >= ${MIN_NODE} (found ${process.env.SPECFLOW_FAKE_NODE_MAJOR || process.versions.node}).`);
  const args = parseArgs(process.argv.slice(2));
  io.json = !!args.flags.json;
  const cmd = args._.shift();
  if (args.flags.version || cmd === 'version') { console.log(`specflow ${frameworkVersion()}`); return; }
  if (!cmd || cmd === 'help' || args.flags.help) { console.log(HELP); return; }
  if (cmd === 'init') return cmdInit(args);
  // install/uninstall work on a Claude project, not on a specflow workspace, so they need no .specflow/.
  if (cmd === 'install') return cmdInstall(args);
  if (cmd === 'uninstall') return cmdUninstall(args);
  if (cmd === 'brief') {
    const root = args.flags.root ? path.resolve(args.flags.root) : findRoot(process.cwd());
    if (!root) { console.log('No .specflow/ workspace here. Run `specflow init` to set one up.'); return; }
    const lines = brief(load(root));
    return emit({ lines }, lines.join('\n'));
  }
  const root = args.flags.root ? path.resolve(args.flags.root) : requireRoot();
  const ctx = load(root);
  const commands = {
    scan: cmdScan,
    doctor: (a, c) => { const d = doctor(c); emit(d, renderDoctor(d)); if (d.some((x) => !x.ok && x.name === 'state validation')) process.exitCode = 1; },
    repo: cmdRepo, feature: cmdFeature, dep: cmdDep, blocker: cmdBlocker, stage: cmdStage, gate: cmdGate, check: cmdCheck,
    branches: cmdBranches, verify: cmdVerify, evidence: cmdEvidence, status: cmdStatus, next: cmdNext, validate: cmdValidate, upgrade: cmdUpgrade, slice: cmdSlice,
  };
  const fn = commands[cmd];
  if (!fn) throw new UserError(`Unknown command "${cmd}". Run \`specflow help\`.`);
  fn(args, ctx);
}

try {
  main();
} catch (e) {
  if (e instanceof UserError) { console.error(e.message); process.exit(1); }
  console.error(`internal error: ${e.stack || e}`);
  process.exit(2);
}
