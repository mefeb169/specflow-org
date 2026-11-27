// Simulation of "clear points": restart the PM session at workflow boundaries once context passes a soft threshold.
// Same model as pmsim.mjs: a fresh session costs RESTART tokens per turn plus EXTRA orientation turns.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const SINCE = '2026-11-16', RESTART = 62000, EXTRA = 3, HARD = 100000;
const BOUNDARY = /gate approve|stage set \S+ (verifying|accepted|released|done)|rework start/;
const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1e3) + 'k');
const WS = ['d--Work-Wali-app', 'd--Work-madfit', 'd--Work-HJI-source'];

function load(dir) {
  const sessions = [];
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const seen = new Set(); const turns = []; let pendingBoundary = false, pendingReturn = false;
    for (const l of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      let j; try { j = JSON.parse(l); } catch { continue; }
      if ((j.timestamp || '') < SINCE || j.isSidechain) continue;
      if (j.type === 'user') { if (JSON.stringify(j.message?.content || '').includes('<task-notification>')) pendingReturn = true; continue; }
      const u = j.message?.usage; if (j.type !== 'assistant' || !u || seen.has(j.message.id)) continue; seen.add(j.message.id);
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const cmds = (j.message.content || []).filter((c) => c.type === 'tool_use' && c.name === 'Bash').map((c) => c.input?.command || '');
      turns.push({ ctx, boundary: pendingBoundary, ret: pendingReturn });
      pendingBoundary = cmds.some((c) => BOUNDARY.test(c)); pendingReturn = false;
    }
    if (turns.length) sessions.push(turns);
  }
  return sessions;
}
// Restart at the first turn that follows a trigger once the (reduced) context is >= soft, or at any turn >= HARD.
function sim(sessions, soft, trigger) {
  let total = 0;
  for (const t of sessions) {
    let off = 0;
    for (const x of t) {
      let v = x.ctx - off;
      if (v >= HARD || (soft && v >= soft && x[trigger])) { total += EXTRA * RESTART; off = x.ctx - RESTART; v = RESTART; }
      total += Math.max(v, Math.min(x.ctx, RESTART));
    }
  }
  return total;
}
const rows = {};
for (const d of WS) {
  const sessions = load(path.join(os.homedir(), '.claude/projects', d));
  const actual = sessions.reduce((s, t) => s + t.reduce((a, x) => a + x.ctx, 0), 0);
  const nb = sessions.reduce((s, t) => s + t.filter((x) => x.boundary).length, 0);
  const nr = sessions.reduce((s, t) => s + t.filter((x) => x.ret).length, 0);
  console.log(`\n${d}: ${sessions.length} sessions, PM context tokens ${k(actual)}, boundary turns ${nb}, dispatch returns ${nr}`);
  const opts = [['a. hard 100k only', 0, 'boundary'], ...[60, 70, 80, 90].map((s) => [`b. boundary, soft ${s}k + hard 100k`, s * 1000, 'boundary']), ['c. every dispatch return + hard 100k', 1, 'ret']];
  for (const [name, soft, trig] of opts) {
    const saved = Math.round(100 - (100 * sim(sessions, soft, trig)) / actual);
    (rows[name] ||= []).push(saved);
    console.log(`  ${name.padEnd(40)} ${saved}% less`);
  }
}
console.log('\nAverage across workspaces:');
for (const [n, v] of Object.entries(rows)) console.log(`  ${n.padEnd(40)} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}%`);
