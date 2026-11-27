import { load } from 'file:///d:/Work/skill-framework/plugins/specflow/scripts/lib/state.mjs';
import { scanUsage, transcriptDir, total, fmtTokens as k } from 'file:///d:/Work/skill-framework/plugins/specflow/scripts/lib/usage.mjs';
import { complexity } from 'file:///d:/Work/skill-framework/plugins/specflow/scripts/lib/models.mjs';
for (const root of ['D:/Work/Wali_app', 'D:/Work/madfit', 'D:/Work/HJI/source']) {
  const ctx = load(root);
  const by = new Map(ctx.backlog.features.map((f) => [f.id, f]));
  const s = scanUsage(transcriptDir(root), new Set(by.keys()));
  const roles = {}; const lvl = {};
  let all = 0;
  for (const [id, it] of Object.entries(s.items)) {
    const f = by.get(id);
    let c = '-'; try { c = f ? complexity(ctx, f).level : '-'; } catch {}
    const g = (lvl[`${c}/${f?.lane || '-'}`] ??= { n: 0, tok: 0, rev: 0, revAgents: 0, fin: 0 });
    g.n++; if (f && ['accepted','released','done'].includes(f.stage)) g.fin++;
    for (const [r, v] of Object.entries(it.roles)) {
      const t = total(v); all += t;
      const R = (roles[r] ??= { tok: 0, agents: 0, models: {} }); R.tok += t; R.agents += v.agents;
      for (const m of Object.keys(v.models)) R.models[m.replace('claude-','')] = 1;
      g.tok += t; if (/reviewer/.test(r)) { g.rev += t; g.revAgents += v.agents; }
    }
  }
  console.log(`\n### ${root}  total ${k(all)}`);
  for (const [r, v] of Object.entries(roles).sort((a,b)=>b[1].tok-a[1].tok)) console.log(`  ${r.padEnd(28)} ${k(v.tok).padStart(7)} ${String(Math.round(100*v.tok/all)).padStart(3)}%  agents ${String(v.agents).padStart(4)}  ${Object.keys(v.models).join(',')}`);
  console.log('  complexity/lane: items finished avg_tokens reviewer_share reviewer_agents');
  for (const [key, g] of Object.entries(lvl).sort()) console.log(`  ${key.padEnd(16)} ${String(g.n).padStart(4)} ${String(g.fin).padStart(4)} ${k(Math.round(g.tok/g.n)).padStart(7)} ${String(Math.round(100*g.rev/(g.tok||1))).padStart(4)}% ${String(g.revAgents).padStart(4)}`);
}
