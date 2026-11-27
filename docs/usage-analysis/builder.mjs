import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const k = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : Math.round(n/1e3)+'k';
const med = (a) => { const b=[...a].sort((x,y)=>x-y); return b[Math.floor(b.length/2)]||0; };
const p90 = (a) => { const b=[...a].sort((x,y)=>x-y); return b[Math.floor(b.length*0.9)]||0; };
for (const d of ['d--Work-Wali-app','d--Work-madfit','d--Work-HJI-source']) {
  const dir = path.join(os.homedir(), '.claude/projects', d);
  const agents = [];
  const resBytes = {}; const calls = {};
  for (const s of fs.readdirSync(dir)) {
    const sub = path.join(dir, s, 'subagents'); if (!fs.existsSync(sub)) continue;
    for (const m of fs.readdirSync(sub).filter((x) => x.endsWith('.meta.json'))) {
      let meta; try { meta = JSON.parse(fs.readFileSync(path.join(sub, m), 'utf8')); } catch { continue; }
      if (meta.agentType !== 'specflow:builder') continue;
      const f = path.join(sub, m.replace('.meta.json', '.jsonl')); if (!fs.existsSync(f)) continue;
      const seen = new Set(); const ctx = []; let tok = 0; const idName = {}; let rework = false; let first = true; let img = 0;
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (first && j.type === 'user') { const t = JSON.stringify(j.message?.content||''); rework = /rework round/.test(t); first = false; }
        const content = Array.isArray(j.message?.content) ? j.message.content : [];
        if (j.type === 'assistant') {
          for (const c of content) if (c.type === 'tool_use') {
            let name = c.name; const cmd = String(c.input?.command||'');
            if (name === 'Bash' || name === 'PowerShell') name = /graphify/.test(cmd) ? 'Bash:graphify' : /\b(test|jest|vitest|pytest|flutter test|npm (run )?test|pnpm|yarn)\b/.test(cmd) ? 'Bash:test/build' : /specflow/.test(cmd) ? 'Bash:specflow' : /\bgit\b/.test(cmd) ? 'Bash:git' : 'Bash:other';
            if (name === 'Read' && /\.(png|jpe?g)$/i.test(c.input?.file_path||'')) { name = 'Read:image'; img++; }
            idName[c.id] = name; calls[name] = (calls[name]||0) + 1;
          }
          const u = j.message?.usage; if (u && !seen.has(j.message.id)) { seen.add(j.message.id);
            const c = (u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0); ctx.push(c); tok += c + (u.output_tokens||0); }
        } else if (j.type === 'user') {
          for (const c of content) if (c.type === 'tool_result') {
            const n = idName[c.tool_use_id] || '?';
            const b = Array.isArray(c.content) ? c.content.reduce((s,x)=> s + (x.type==='image' ? 6000 : String(x.text||'').length), 0) : String(c.content||'').length;
            resBytes[n] = (resBytes[n]||0) + b;
          }
        }
      }
      if (ctx.length) agents.push({ turns: ctx.length, tok, max: Math.max(...ctx), firstc: ctx[0], rework, img });
    }
  }
  const T = agents.reduce((s,a)=>s+a.tok,0);
  const rw = agents.filter(a=>a.rework);
  const big = [...agents].sort((a,b)=>b.tok-a.tok); const top10 = big.slice(0, Math.ceil(agents.length/10)).reduce((s,a)=>s+a.tok,0);
  console.log(`\n### ${d}: ${agents.length} builders, ${k(T)} tokens`);
  console.log(`  turns/agent median ${med(agents.map(a=>a.turns))} p90 ${p90(agents.map(a=>a.turns))} | start ctx median ${k(med(agents.map(a=>a.firstc)))} | peak ctx median ${k(med(agents.map(a=>a.max)))} p90 ${k(p90(agents.map(a=>a.max)))}`);
  console.log(`  top 10% of builders = ${Math.round(100*top10/T)}% of builder tokens | rework-round builders: ${rw.length} (${Math.round(100*rw.reduce((s,a)=>s+a.tok,0)/T)}% of tokens) | builders reading images: ${agents.filter(a=>a.img).length}`);
  const totB = Object.values(resBytes).reduce((s,x)=>s+x,0);
  console.log('  tool results by size (share of chars returned into context) / calls:');
  for (const [n,b] of Object.entries(resBytes).sort((a,b)=>b[1]-a[1]).slice(0,9)) console.log(`    ${n.padEnd(16)} ${String(Math.round(100*b/totB)).padStart(3)}%  ${String(calls[n]||0).padStart(5)} calls  avg ${k(b/(calls[n]||1))} chars`);
}
