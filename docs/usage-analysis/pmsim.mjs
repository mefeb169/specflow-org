import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const k = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : Math.round(n/1e3)+'k';
const RESTART = 62000, EXTRA = 3; // fresh session (53k) + brief/handoff/flow skill, plus a few re-orientation turns
for (const d of ['d--Work-Wali-app','d--Work-madfit','d--Work-HJI-source']) {
  const dir = path.join(os.homedir(), '.claude/projects', d); const sessions = []; let cyc = { spawn: 0, turnsAfterNotif: [] };
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const seen = new Set(); const c = []; let sinceNotif = null;
    for (const l of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      let j; try { j = JSON.parse(l); } catch { continue; }
      if ((j.timestamp||'') < '2026-11-16' || j.isSidechain) continue;
      if (j.type === 'user') { const t = JSON.stringify(j.message?.content||''); if (t.includes('<task-notification>')) { if (sinceNotif !== null) cyc.turnsAfterNotif.push(sinceNotif); sinceNotif = 0; } else if (!t.includes('tool_result')) { if (sinceNotif !== null) cyc.turnsAfterNotif.push(sinceNotif); sinceNotif = null; } }
      const u = j.message?.usage; if (j.type !== 'assistant' || !u || seen.has(j.message.id)) continue; seen.add(j.message.id);
      if (sinceNotif !== null) sinceNotif++;
      c.push((u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0));
    }
    if (c.length) sessions.push(c);
  }
  const actual = sessions.reduce((s,c)=>s+c.reduce((a,b)=>a+b,0),0);
  const sim = (B) => sessions.reduce((s, c) => { let t = 0, off = 0;
    for (let i = 0; i < c.length; i++) { let v = c[i] - off; if (v > B) { off = c[i] - RESTART; v = RESTART; t += EXTRA * RESTART; } t += Math.max(v, Math.min(c[i], RESTART)); } return s + t; }, 0);
  const a = cyc.turnsAfterNotif.sort((x,y)=>x-y);
  console.log(`${d}: PM context tokens since 0.8.0 ${k(actual)} | budget 120k: ${Math.round(100-100*sim(120000)/actual)}% less | 100k: ${Math.round(100-100*sim(100000)/actual)}% less | 90k: ${Math.round(100-100*sim(90000)/actual)}% less`);
  console.log(`   PM turns handling each finished subagent (until next user msg/notification): n=${a.length} median ${a[Math.floor(a.length/2)]} p90 ${a[Math.floor(a.length*0.9)]} total ${a.reduce((s,x)=>s+x,0)}`);
}
