import fs from 'node:fs';
const src = fs.readFileSync('scripts/prover-probes.mjs', 'utf8');
const block = src.slice(src.indexOf("name: 'str_step'"));
const pre = eval('([' + block.match(/prelude: \[([\s\S]*?)\]\.join/)[1] + ']).join("\\n")');
const decl = block.match(/decl: \[([\s\S]*?)\]\.join/)[1]
  .split("',\n").map((s) => s.replace(/^[\s']+|[\s',]+$/g, '').replace(/\\'/g, "'")).join('\n');
const code = `${pre}\n\n${decl}\n`;
code.split('\n').forEach((l, i) => console.log(String(i + 1).padStart(2), l));
