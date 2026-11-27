import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const k = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : Math.round(n/1e3)+'k';
for (const d of ['d--Work-Wali-app','d--Work-madfit']) {
  const dir = path.join(os.homedir(), '.claude/projects', d); const by = {}; const top = [];
  for (const s of fs.readdirSync(dir)) {
    const sub = path.join(dir, s, 'subagents'); if (!fs.existsSync(sub)) continue;
    for (const m of fs.readdirSync(sub).filter((x) => x.endsWith('.meta.json'))) {
      let meta; try { meta = JSON.parse(fs.readFileSync(path.join(sub, m), 'utf8')); } catch { continue; }
      if (meta.agentType !== 'specflow:builder') continue;
      const f = path.join(sub, m.replace('.meta.json', '.jsonl')); if (!fs.existsSync(f)) continue;
      const idCmd = {}; let tok = 0; const seen = new Set(); let prompt = ''; let tasks = 0;
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        let j; try { j = JSON.parse(l); } catch { continue; }
        const content = Array.isArray(j.message?.content) ? j.message.content : [];
        if (!prompt && j.type === 'user') prompt = (typeof j.message.content === 'string' ? j.message.content : JSON.stringify(j.message.content)).slice(0, 110).replace(/\n/g,' ');
        if (j.type === 'assistant') {
          for (const c of content) if (c.type === 'tool_use' && (c.name === 'Bash' || c.name === 'PowerShell')) {
            const cmd = String(c.input?.command||'').trim();
            if (/graphify|specflow|\bgit\b|\b(test|jest|vitest|pytest|npm (run )?test|pnpm|yarn)\b/.test(cmd)) continue;
            let key = cmd.replace(/^cd [^&;]+(&&|;)\s*/, '').split(/\s+/)[0].replace(/^.*\//,'');
            if (/screenshot|playwright|chrome|puppeteer/i.test(cmd)) key = '(screenshot/browser)';
            idCmd[c.id] = key;
          }
          const u = j.message?.usage; if (u && !seen.has(j.message.id)) { seen.add(j.message.id); tok += (u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.output_tokens||0); }
        } else if (j.type === 'user') for (const c of content) if (c.type === 'tool_result' && idCmd[c.tool_use_id]) {
          const b = Array.isArray(c.content) ? c.content.reduce((s,x)=>s+String(x.text||'').length,0) : String(c.content||'').length;
          const o = (by[idCmd[c.tool_use_id]] ??= { n: 0, b: 0 }); o.n++; o.b += b;
        }
      }
      top.push({ tok, turns: seen.size, prompt });
    }
  }
  const T = Object.values(by).reduce((s,x)=>s+x.b,0);
  console.log(`\n### ${d} Bash:other by command`);
  for (const [n,o] of Object.entries(by).sort((a,b)=>b[1].b-a[1].b).slice(0,10)) console.log(`  ${n.slice(0,24).padEnd(24)} ${String(Math.round(100*o.b/T)).padStart(3)}% ${String(o.n).padStart(5)} calls avg ${k(o.b/o.n)}`);
  console.log('  costliest builders:');
  for (const t of top.sort((a,b)=>b.tok-a.tok).slice(0,5)) console.log(`   ${k(t.tok).padStart(6)} ${String(t.turns).padStart(4)} turns  ${t.prompt}`);
}
