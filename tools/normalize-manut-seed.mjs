/**
 * Normalize imported maintenance seed data (receitas, cond, descriptions).
 * Run: node tools/normalize-manut-seed.mjs
 */
import fs from 'fs';

const SEED = 'C:/Users/Kamile/Projects/gralha-azul/gestao-manut-seed.json';

function cleanCond(cond) {
  if (!cond || cond === '-') return cond;
  let c = cond.trim();
  const code = c.match(/\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)\b/i);
  if (code && c.indexOf('R$') >= 0) return code[1].toUpperCase();
  c = c.replace(/\s+R\$\s*[\d.,]+.*$/i, '').trim();
  if (c.length > 55) c = c.slice(0, 55);
  return c || '-';
}

function cleanDesc(desc) {
  if (!desc || desc === '-') return desc;
  let d = desc.trim();
  if (d.length <= 3 && /^[a-z\s]*$/i.test(d)) return '-';
  d = d.replace(/\b(\w{2,})(?:\s+\1\b)+/gi, '$1');
  return d.slice(0, 200) || '-';
}

function normalizeRec(m) {
  const val = parseFloat(m.val) || 0;
  const mat = parseFloat(m.mat) || 0;
  let rec = parseFloat(m.recKenlo);
  if (Number.isNaN(rec)) rec = 0;
  const expected = Math.max(0, val - mat);
  if (val > 0 && rec === 0 && expected > 0) {
    m.recKenlo = expected.toFixed(2);
    return true;
  }
  if (val > 0 && mat >= 0 && rec > val + 0.02) {
    m.recKenlo = expected.toFixed(2);
    return true;
  }
  if (val > 0 && rec > 0 && Math.abs(rec - expected) > 0.02 && rec === val && mat > 0) {
    m.recKenlo = expected.toFixed(2);
    return true;
  }
  return false;
}

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
let stats = { cond: 0, desc: 0, rec: 0 };

for (const k of ['imob', 'cond', 'ocup', 'ager']) {
  for (const m of seed[k] || []) {
    const nc = cleanCond(m.cond);
    if (nc !== m.cond) { m.cond = nc; stats.cond++; }
    const nd = cleanDesc(m.desc);
    if (nd !== m.desc) { m.desc = nd; stats.desc++; }
    if (normalizeRec(m)) stats.rec++;
    m.recKenlo = Number(parseFloat(m.recKenlo) || 0).toFixed(2);
  }
}

seed.meta = { ...(seed.meta || {}), normalizedAt: new Date().toISOString() };
fs.writeFileSync(SEED, JSON.stringify(seed), 'utf8');

for (const k of ['imob', 'cond', 'ocup', 'ager']) {
  const arr = seed[k] || [];
  const rev = arr.reduce((s, r) => s + parseFloat(r.recKenlo || 0), 0);
  console.log(k + ':', arr.length, 'receita R$', rev.toFixed(2));
}
console.log('Fixed:', stats);
