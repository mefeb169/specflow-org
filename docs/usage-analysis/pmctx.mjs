import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const med = (a) => { if (!a.length) return 0; a.sort((x,y)=>x-y); return a[Math.floor(a.length/2)]; };
for (const d of ['d--Work-Wali-app','d--Work-madfit','d--Work-HJI-source']) {
  const dir = path.join(os.homedir(), '.claude/projects', d);
  const g = { before: [], after: [] }; const turns = { before: 0, after: 0 }; const sess = { before: new Set(), after: new Set() };
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const seen = new Set();
    for (const l of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      if (!l.includes('"usage"')) continue; let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.type !== 'assistant' || j.isSidechain || !j.message?.usage || seen.has(j.message.id)) continue; seen.add(j.message.id);
      const u = j.message.usage; const c = (u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0);
      const k = (j.timestamp||'') >= '2026-11-16' ? 'after' : 'before'; g[k].push(c); turns[k]++; sess[k].add(n);
    }
  }
  const f = (k) => `${String(turns[k]).padStart(6)} turns, ${String(sess[k].size).padStart(3)} sessions, median ctx ${Math.round(med(g[k])/1000)}k, p90 ${Math.round(g[k].sort((a,b)=>a-b)[Math.floor(g[k].length*0.9)]/1000||0)}k, turns>150k ${Math.round(100*g[k].filter(x=>x>150000).length/(g[k].length||1))}%`;
  console.log(`${d}\n  before 0.8.0: ${f('before')}\n  after  0.8.0: ${f('after')}`);
}
