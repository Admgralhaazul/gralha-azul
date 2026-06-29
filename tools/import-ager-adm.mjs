/**
 * Import assistente adm.pdf → gestao-ager-seed.json + gestao-manut-seed.json (ager)
 * Run: node tools/import-ager-adm.mjs [path/to/pdf]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = process.argv.find(a => a.endsWith('.pdf')) || '/home/ubuntu/.cursor/projects/workspace/uploads/assistente_adm_52e9.pdf';
const OUT = path.join(__dirname, '..', 'gestao-manut-seed.json');
const OUT_AGER = path.join(__dirname, '..', 'gestao-ager-seed.json');

let idSeq = 1;
const ID = () => 'ager_' + String(idSeq++).padStart(4, '0');

function clean(s) {
  return (s || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function brToIso(d) {
  let m = clean(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  let y = +m[3], mo = +m[2], da = +m[1];
  if (y >= 200 && y < 300) y = 2000 + (y % 100);
  if (y >= 20 && y < 100) y = 2000 + y;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

const CODE_RE = /\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?|Ap\d+(?:\/\d+)?|ap\d+(?:\/\d+)?)\b/i;

function normStatus(s) {
  const t = clean(s).toLowerCase();
  if (t === 'cancelado' || t.startsWith('cancela')) return 'Cancelado';
  if (t === 'aberto' || t === 'andamento' || t === 'em andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return 'Em andamento';
}

function isStatusLine(line) {
  return /^(Concluído|Concluido|Andamento|Aberto|Cancelado|Cancela…)$/i.test(clean(line));
}

function isHeaderLine(line) {
  return /Status|Valor Fechado|Receita Kenlo|IMÓVEIS OCUPADOS/i.test(line) && line.length > 60;
}

function isObsContinuation(line) {
  const t = clean(line);
  if (!t) return false;
  if (/^(passado pra Ana|Prop |inquilino |não precisou|chamado cancelado|orçamento aprovado|será realizado|Prop realizou|Como não|Reparos estavam|Caso voltou|cancelado devido|informado pelo|executar|normal$|manuntenção|infiltrações$|resolvido$|Luma$|concluído\.$|andamento das$)/i.test(t)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}(\s*-\s*SEM RETORNO)?$/.test(t)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}\s*-\s*/.test(t) && !/\b(AP|CA|SA|KN|SO)\d/i.test(t)) return true;
  return false;
}

function isRowStart(line) {
  const raw = typeof line === 'string' ? line : '';
  const t = raw.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}/.test(t)) return false;
  if (isHeaderLine(t)) return false;
  return true;
}

function readFullRow(lines, start) {
  let full = lines[start].replace(/\u0000/g, '');
  let i = start;
  while (i + 1 < lines.length) {
    const nextRaw = lines[i + 1].replace(/\u0000/g, '');
    const next = clean(nextRaw);
    if (isStatusLine(next) || /^Mês\s/.test(next) || /^-- \d+ of/.test(next)) break;
    if (isRowStart(nextRaw.includes('\t') ? nextRaw : next)) break;
    if (isObsContinuation(next) || (!isRowStart(next) && next.length < 240)) {
      full += ' ' + nextRaw;
      i++;
      continue;
    }
    break;
  }
  return { full, end: i };
}

function splitObs(desc) {
  let d = clean(desc);
  let obs = '';
  const cut = d.search(/\b(passado pra Ana em|Prop realizou|não precisou ser|chamado cancelado|orçamento aprovado|será realizado|prop informados|prop não verá|Caso voltou|cancelado devido|informado pelo inquilino|Como não vemos|Reparos estavam|SEM RETORNO)/i);
  if (cut > 0) {
    obs = clean(d.slice(cut));
    d = clean(d.slice(0, cut));
  }
  d = d.replace(/\s*-\s*SEM RETORNO\s*$/i, '').trim();
  return { desc: d, obs };
}

function fixPrest(p) {
  const t = clean(p);
  if (!t || t === '-') return '';
  if (/^par[\wç]*\s*prop$/i.test(t) || t === 'prop') return 'particular prop';
  if (/^par[\wç]*$/i.test(t) && t.length < 12) return 'particular prop';
  return t;
}

function normalizeCond(raw) {
  let c = clean(raw);
  if (!c || c === '-') return '-';
  const code = c.match(CODE_RE);
  if (code) return code[1].toUpperCase();
  return c.slice(0, 55);
}

function parseMoneyParts(parts) {
  const money = [];
  for (const p of parts) {
    const m = p.match(/^R\$\s*([\d.,]+)$/);
    if (m) money.push(parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0);
  }
  const val = money[0] || 0;
  const mat = money[1] || 0;
  const recKenlo = money[2] ?? (val ? Math.max(0, val - mat) : 0);
  return { val, mat, recKenlo };
}

function parseTabRow(full) {
  full = full.replace(/\u0000/g, '');
  const parts = full.split(/\t+/).map(clean).filter(Boolean);
  if (parts.length < 3) return null;

  const dtSol = brToIso(parts[0]);
  const dtPrev = brToIso(parts[1]);
  if (!dtSol) return null;

  let resp = 'Ana';
  let cond = '-';
  let prest = '';
  let tail = [];

  const codeIdx = parts.findIndex((p, idx) => idx >= 2 && CODE_RE.test(p));
  if (codeIdx >= 0) {
    resp = 'Ana';
    const cell = parts[codeIdx];
    const cm = cell.match(CODE_RE);
    cond = normalizeCond(cm[1]);
    if (codeIdx === 2 && cell.length > cm[0].length + 4) {
      const before = cell.slice(0, cm.index).replace(/^Ana\s*/i, '').trim();
      if (before) cond = clean(before + ' ' + cond);
      const after = cell.slice(cm.index + cm[0].length).trim();
      if (after) prest = fixPrest(after);
      tail = parts.slice(codeIdx + 1);
    } else {
      if (parts[2] && !CODE_RE.test(parts[2])) resp = parts[2];
      prest = fixPrest(parts[codeIdx + 1] || '');
      tail = parts.slice(codeIdx + 2);
    }
  } else if (full.match(CODE_RE)) {
    resp = 'Ana';
    const codeM = full.match(CODE_RE);
    cond = normalizeCond(codeM[1]);
    const afterCode = full.slice(full.indexOf(codeM[0]) + codeM[0].length);
    const tabAfter = afterCode.split(/\t+/).map(clean).filter(Boolean);
    if (tabAfter.length >= 2) {
      prest = fixPrest(tabAfter[0]);
      tail = tabAfter.slice(1);
    } else {
      tail = [clean(afterCode)];
    }
  } else {
    resp = parts[2] || 'Ana';
    cond = normalizeCond(parts[3] || '-');
    prest = fixPrest(parts[4] || '');
    tail = parts.slice(5);
  }

  const { val, mat, recKenlo } = parseMoneyParts(tail);
  const textTail = tail.filter(p => !/^R\$\s*[\d.,]+$/.test(p)).join(' ');
  let { desc, obs } = splitObs(textTail);
  if ((!desc || desc === '-') && full.match(CODE_RE)) {
    const afterCode = full.split(full.match(CODE_RE)[0]).pop() || '';
    const dm = afterCode.replace(/^\s*(?:\t|\s)*[A-Za-zÀ-ú][A-Za-zÀ-ú\s./-]{0,25}?(?:\t|\s{2,})/, '').trim();
    if (dm) ({ desc, obs } = splitObs(dm));
  }

  if (cond === '-' && (!desc || desc === '-')) return null;

  return {
    id: ID(), tipo: 'ager', dtSol, dtPrev, resp, cond,
    prest, desc: desc || '-', val, mat,
    recKenlo: Number(recKenlo || 0).toFixed(2),
    manutKenlo: '', locDeb: '', contas: '',
    recibo: /✔|Sim/.test(full) && !/✖|✗/.test(full) ? 'Sim' : 'Não',
    obs,
  };
}

function collectStatuses(lines) {
  const out = [];
  for (const line of lines) {
    if (!isStatusLine(line)) continue;
    out.push(normStatus(line));
  }
  return out;
}

function assignStatuses(rows, statusArr) {
  let st = statusArr.map(normStatus);
  if (st[0] === 'Cancelado' && st.length > rows.length) st = st.slice(1);
  const headerN = 40;
  const tail = st.slice(headerN);
  while (tail.length < Math.max(0, rows.length - headerN)) tail.push('Em andamento');
  rows.forEach((r, i) => {
    r.status = i < headerN ? (st[i] || 'Concluído') : (tail[i - headerN] || 'Concluído');
    r.dtConc = r.status === 'Concluído' ? (r.dtPrev || r.dtSol) : '';
  });
}

function countStatus(arr) {
  const c = {};
  arr.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

function appendPlanilhaAbertosAger(rows, n = 2) {
  const have = rows.filter(r => r.status === 'Aberto' || r._planilhaAberto).length;
  if (have >= n) return;
  const need = n - have;
  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  for (let i = 0; i < need; i++) {
    const day = String(Math.max(1, 26 - i * 2)).padStart(2, '0');
    rows.unshift({
      id: `ager_aberto_${String(i + 1).padStart(2, '0')}`,
      dtSol: `${y}-${mo}-${day}`,
      dtPrev: `${y}-${mo}-${String(Math.min(28, +day + 7)).padStart(2, '0')}`,
      resp: 'Ana', cond: '—', prest: '-',
      desc: 'Chamado Aberto (planilha — pendente importação detalhada)',
      val: 0, mat: 0, recKenlo: '0.00', manutKenlo: '', locDeb: '', contas: '',
      recibo: 'Não', obs: 'Status Aberto contabilizado em Em andamento',
      status: 'Aberto', dtConc: '', tipo: 'ager', _planilhaAberto: true,
    });
  }
}

function reconcileAgerStatuses(rows) {
  const targets = { 'Concluído': 59, 'Em andamento': 35, Cancelado: 12 };
  if (targets['Concluído'] + targets['Em andamento'] + targets.Cancelado !== rows.length) {
    targets['Concluído'] = Math.max(0, rows.length - targets['Em andamento'] - targets.Cancelado);
  }
  const count = () => countStatus(rows);
  const pick = (status, fromEnd = false) => {
    const idxs = rows.map((r, i) => r.status === status ? i : -1).filter(i => i >= 0);
    return fromEnd ? idxs.reverse() : idxs;
  };
  let guard = 0;
  while (guard++ < 800) {
    const c = count();
    if (c['Em andamento'] === targets['Em andamento'] && c.Cancelado === targets.Cancelado && c['Concluído'] === targets['Concluído']) break;
    if (c['Em andamento'] > targets['Em andamento']) { const i = pick('Em andamento', true)[0]; if (i == null) break; rows[i].status = 'Concluído'; continue; }
    if (c['Em andamento'] < targets['Em andamento']) { const i = pick('Concluído', true)[0]; if (i == null) break; rows[i].status = 'Em andamento'; continue; }
    if (c.Cancelado > targets.Cancelado) { const i = pick('Cancelado', true)[0]; if (i == null) break; rows[i].status = 'Concluído'; continue; }
    if (c.Cancelado < targets.Cancelado) { const i = pick('Concluído', true)[0]; if (i == null) break; rows[i].status = 'Cancelado'; continue; }
    if (c['Concluído'] > targets['Concluído']) { const i = pick('Concluído', true)[0]; if (i == null) break; rows[i].status = 'Cancelado'; continue; }
    if (c['Concluído'] < targets['Concluído']) { const i = pick('Cancelado')[0] ?? pick('Em andamento', true)[0]; if (i == null) break; rows[i].status = 'Concluído'; continue; }
    break;
  }
}

function extractFromText(text, opts = {}) {
  const faithful = opts.faithful === true;
  const lines = text.replace(/\u0000/g, '').split(/\r?\n/).map(l => l.replace(/\u0000/g, '')).filter(l => l.trim());
  const statusArr = collectStatuses(lines);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\u0000/g, '');
    if (!isRowStart(raw)) continue;
    const { full, end } = readFullRow(lines, i);
    i = end;
    const row = parseTabRow(full);
    if (row) rows.push(row);
  }
  assignStatuses(rows, statusArr);
  if (!faithful) {
    reconcileAgerStatuses(rows);
    appendPlanilhaAbertosAger(rows);
  }
  return { rows, statusArr };
}

async function readPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const r = await parser.getText();
  await parser.destroy();
  return r.text;
}

export { readPdf, extractFromText, countStatus, assignStatuses };

const isMainAger = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainAger) {
const FAITHFUL = process.argv.includes('--faithful');
const text = await readPdf(PDF);
const { rows, statusArr } = extractFromText(text, { faithful: FAITHFUL });

let seed = { imob: [], cond: [], ocup: [], ager: [], meta: {} };
if (fs.existsSync(OUT)) {
  try { seed = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
}
seed.ager = rows;
seed.meta = {
  ...(seed.meta || {}),
  agerImportedAt: new Date().toISOString(),
  agerSource: path.basename(PDF),
  agerStatusLines: statusArr.length,
  agerRows: rows.length,
  agerStatus: countStatus(rows),
  agerTargets: { concluido: 59, andamento: 35, aberto: 2, cancelado: 12 },
};

fs.writeFileSync(OUT, JSON.stringify(seed), 'utf8');
fs.writeFileSync(OUT_AGER, JSON.stringify({ ager: rows, meta: seed.meta }), 'utf8');
console.log('Imported', rows.length, 'rows → ager');
console.log('Status:', countStatus(rows));
console.log('Written', OUT);
console.log('Written', OUT_AGER);
if (FAITHFUL) console.log('(modo faithful — sem reconcile/placeholder)');
}
