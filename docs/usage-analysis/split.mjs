import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const k = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : Math.round(n/1e3)+'k';
const REORIENT_TOK = 15000, REORIENT_TURNS = 5;
for (const d of ['d--Work-Wali-app','d--Work-madfit','d--Work-HJI-source']) {
  const dir = path.join(os.homedir(), '.claude/projects', d); const runs = [];
  for (const s of fs.readdirSync(dir)) {
    const sub = path.join(dir, s, 'subagents'); if (!fs.existsSync(sub)) continue;
    for (const m of fs.readdirSync(sub).filter((x) => x.endsWith('.meta.json'))) {
      let meta; try { meta = JSON.parse(fs.readFileSync(path.join(sub, m), 'utf8')); } catch { continue; }
      if (meta.agentType !== 'specflow:builder') continue;
      const f = path.join(sub, m.replace('.meta.json', '.jsonl')); if (!fs.existsSync(f)) continue;
      const seen = new Set(); const c = [];
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.includes('"usage"')) continue; let j; try { j = JSON.parse(l); } catch { continue; }
        const u = j.message?.usage; if (j.type !== 'assistant' || !u || seen.has(j.message.id)) continue; seen.add(j.message.id);
        c.push((u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0)); }
      if (c.length) runs.push(c);
    }
  }
  const actual = runs.reduce((s,c)=>s+c.reduce((a,b)=>a+b,0),0);
  const sim = (chunk) => runs.reduce((s, c) => { let t = 0; let base = 0; let start = c[0];
    for (let i = 0; i < c.length; i++) { if (i > 0 && i % chunk === 0) { base = start + REORIENT_TOK - c[i]; t += REORIENT_TURNS * (start + REORIENT_TOK); } t += Math.max(c[i] + base, start); } return s + t; }, 0);
  console.log(`${d}: builder context tokens ${k(actual)} | split every 60 turns: ${k(sim(60))} (-${Math.round(100-100*sim(60)/actual)}%) | every 40: ${k(sim(40))} (-${Math.round(100-100*sim(40)/actual)}%) | every 25: ${k(sim(25))} (-${Math.round(100-100*sim(25)/actual)}%)`);
}
