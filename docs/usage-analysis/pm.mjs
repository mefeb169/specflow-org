import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const k = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : Math.round(n/1e3)+'k';
for (const d of ['d--Work-Wali-app','d--Work-madfit','d--Work-HJI-source']) {
  const dir = path.join(os.homedir(), '.claude/projects', d);
  const res = {}; const calls = {}; let userChars = 0, userMsgs = 0, asstOut = 0, turns = 0, sysrem = 0; const agentRes = []; const perTurnUser = [];
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const idName = {}; const seen = new Set(); let turnsSinceUser = 0;
    for (const l of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      let j; try { j = JSON.parse(l); } catch { continue; }
      if ((j.timestamp||'') < '2026-11-16' || j.isSidechain) continue;
      const content = Array.isArray(j.message?.content) ? j.message.content : [];
      if (j.type === 'assistant') {
        if (j.message?.usage && !seen.has(j.message.id)) { seen.add(j.message.id); turns++; turnsSinceUser++; asstOut += j.message.usage.output_tokens||0; }
        for (const c of content) if (c.type === 'tool_use') {
          let name = c.name; const cmd = String(c.input?.command||'');
          if (name === 'Bash' || name === 'PowerShell') { const m = cmd.match(/specflow(?:\.mjs)?"?\s+(\w+)(?:\s+(\w+))?/); name = m ? `specflow ${m[1]}${['status','question','gate','release','deliver','decision','team'].includes(m[1]) && m[2] && !/^F-/.test(m[2]) ? ' '+m[2] : ''}` : /\bgit\b/.test(cmd) ? 'Bash:git' : /graphify/.test(cmd) ? 'Bash:graphify' : `Bash:${cmd.replace(/^cd [^&;]+(&&|;)\s*/, '').split(/\s+/)[0].replace(/^.*\//,'').slice(0,12)}`; }
          idName[c.id] = name; calls[name] = (calls[name]||0)+1;
        }
      } else if (j.type === 'user') {
        if (typeof j.message?.content === 'string') { if (j.message.content.includes('<system-reminder>')) sysrem += j.message.content.length; else { userChars += j.message.content.length; userMsgs++; perTurnUser.push(turnsSinceUser); turnsSinceUser = 0; } }
        for (const c of content) {
          if (c.type === 'text') { if (/system-reminder|hook/.test(c.text)) sysrem += c.text.length; else { userChars += c.text.length; userMsgs++; perTurnUser.push(turnsSinceUser); turnsSinceUser = 0; } }
          if (c.type === 'tool_result') { const nm = idName[c.tool_use_id]||'?'; const b = Array.isArray(c.content) ? c.content.reduce((s,x)=>s+(x.type==='image'?6000:String(x.text||'').length),0) : String(c.content||'').length; res[nm] = (res[nm]||0)+b; if (nm === 'Agent') agentRes.push(b); }
        }
      }
    }
  }
  const T = Object.values(res).reduce((s,x)=>s+x,0);
  perTurnUser.sort((a,b)=>a-b);
  console.log(`\n### ${d} (since 0.8.0): ${turns} PM turns, ${userMsgs} user messages (median ${perTurnUser[Math.floor(perTurnUser.length/2)]} PM turns per user message), tool output ${k(T)} chars, hook/system text ${k(sysrem)} chars, PM output ${k(asstOut)} tokens`);
  agentRes.sort((a,b)=>a-b); console.log(`  Agent reports returned: ${agentRes.length}, median ${agentRes[Math.floor(agentRes.length/2)]||0} chars, p90 ${agentRes[Math.floor(agentRes.length*0.9)]||0}`);
  for (const [n,b] of Object.entries(res).sort((a,b)=>b[1]-a[1]).slice(0,14)) console.log(`  ${n.padEnd(24)} ${String(Math.round(100*b/T)).padStart(3)}%  ${String(calls[n]||0).padStart(4)} calls avg ${k(b/(calls[n]||1))}`);
}
