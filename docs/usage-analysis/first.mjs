import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
for (const d of ['d--Work-Wali-app','d--Work-madfit','d--Work-HJI-source']) {
  const dir = path.join(os.homedir(), '.claude/projects', d); const firsts = [];
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    for (const l of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      if (!l.includes('"usage"')) continue; let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.type !== 'assistant' || j.isSidechain || !j.message?.usage) continue;
      if ((j.timestamp||'') < '2026-11-16') break;
      const u = j.message.usage; firsts.push(Math.round(((u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0))/1000)); break;
    }
  }
  firsts.sort((a,b)=>a-b); console.log(d, 'first-turn context (k):', firsts.join(' '));
}
