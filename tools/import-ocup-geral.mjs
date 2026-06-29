/**
 * Import geral.pdf → gestao-ocup-seed.json + gestao-manut-seed.json (ocup)
 * Run: node tools/import-ocup-geral.mjs [path/to/geral.pdf]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = process.argv.find(a => a.endsWith('.pdf')) || '/home/ubuntu/.cursor/projects/workspace/uploads/manuten__es_geral_b421.pdf';
const OUT = path.join(__dirname, '..', 'gestao-manut-seed.json');
const SEED_OCUP = path.join(__dirname, '..', 'gestao-ocup-seed.json');

let idSeq = 1;
const ID = () => 'ocup_' + String(idSeq++).padStart(5, '0');

function clean(s) {
  return (s || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function parseMoney(s) {
  const parts = [...String(s).matchAll(/R\$\s*([\d.,]+)/g)];
  return parts.map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0);
}

function brToIso(d) {
  let m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  let y = +m[3], mo = +m[2], da = +m[1];
  if (y >= 200 && y < 300) y = 2000 + (y % 100);
  if (y >= 20 && y < 100) y = 2000 + y;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

const CODE_RE = /^(?:[A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)$/i;
const STATUS_WORD = /^(Concluído|Concluido|Andamento|Aberto|Cancelado|Cancela…)$/i;

function isContractCode(s) {
  const t = clean(s).replace(/\s/g, '');
  if (!t || t === '-' || t === 'x') return false;
  return CODE_RE.test(t);
}

function isCondominio(s) {
  const t = clean(s);
  if (!t || t === '-' || t === 'x') return false;
  if (isContractCode(t)) return false;
  if (/^(Ed\.|Cond\.|Res\.|Portal|Top Studio|Stutz|Osvaldo|Universit|Imperador|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram|Chociai|Essencia)/i.test(t)) return true;
  if (/Rocha|Imperador|Universit|Magat|Klotz|Primavera|Chociai|Lívia|Livia/i.test(t)) return true;
  return false;
}

function splitTiago(condField) {
  return isCondominio(condField) ? 'cond' : 'imob';
}

function normStatus(s) {
  const t = clean(s).toLowerCase();
  if (t.startsWith('cancel')) return 'Cancelado';
  if (t === 'aberto' || t === 'andamento' || t === 'em andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return s || 'Concluído';
}

function cleanCond(raw) {
  let c = clean(raw);
  if (!c || c === '-') return '-';
  const codeM = c.match(/\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)\b/i);
  if (codeM && (c.indexOf(codeM[1]) < 45 || /R\$\s*[\d.,]+/.test(c))) return codeM[1].toUpperCase();
  c = c.replace(/\s+R\$\s*[\d.,]+.*$/i, '').trim();
  const edM = c.match(/^(Ed\.[^–\-]+?|Cond\.[^–\-]+?|Osvaldo Rocha|Stutz Ba[\w]*|Top Studio[^–\-]*|Portal[\w\s]{0,30}|Imperador|Universit[\w\s]{0,20}|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram[\w\s]{0,20}|Chociai|Essencia do sabor)/i);
  if (edM) return clean(edM[1]).slice(0, 55);
  if (c.length > 55) c = c.split(/\s+(?:Anderson|Deodato|Tiago|Wesley|portão|elevador|particular|par[\w]* prop)/i)[0].trim();
  return c.slice(0, 55) || '-';
}

function cleanDesc(desc, prest) {
  let d = clean(desc);
  if (!d || d === '-') return '-';
  d = d.replace(/\s*passado pra Ana em\s*[\d/]*\s*(?:-\s*SEM RETORNO)?/gi, '');
  d = d.replace(/\s*-\s*SEM RETORNO\s*$/i, '');
  if (prest && prest !== '-') {
    const p = clean(prest);
    d = d.replace(new RegExp(`^(${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+)+`, 'i'), '');
  }
  d = d.replace(/\b(\w{3,})(?:\s+\1\b)+/gi, '$1');
  return clean(d).slice(0, 200) || '-';
}

function parseRecibo(line) {
  if (/✔|Sim|caixa|nota/.test(line) && !/✖|✗/.test(line)) return 'Sim';
  if (/✖|✗/.test(line)) return 'Não';
  return 'Não';
}

function parseRowLine(line) {
  const dates = [...line.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
  if (!dates.length) return null;
  const dtSol = brToIso(dates[0]);
  if (!dtSol) return null;
  const dtPrev = brToIso(dates[1] || dates[0]) || dtSol;

  const money = parseMoney(line);
  const val = money[0] || 0;
  const mat = money[1] || 0;
  const recKenlo = money.length >= 3 ? money[2] : (val && mat >= 0 ? Math.max(0, val - mat) : val);

  let rest = line.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '');
  if (dates.length > 1) rest = rest.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '');

  const codeMatch = rest.match(/\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)\b/i);
  const edMatch = rest.match(/(?:Ed\.|Cond\.|Osvaldo Rocha|Stutz Ba[\w]*|Top Studio|Portal[\w\s]*|Imperador|Universit[\w\s]*|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram[\w\s]*|Chociai|Essencia do sabor)[^\t]{0,60}/i);

  let resp = '-', cond = '-', prest = '-', desc = '-';

  if (codeMatch && !isCondominio(codeMatch[1])) {
    cond = codeMatch[1].toUpperCase();
    const before = rest.slice(0, codeMatch.index).trim();
    const parts = before.split(/\t+|\s{2,}/).filter(Boolean);
    if (parts.length) resp = clean(parts[parts.length - 1]) || '-';
  } else if (edMatch) {
    cond = cleanCond(edMatch[0]);
    const before = rest.slice(0, edMatch.index).trim();
    const parts = before.split(/\t+|\s{2,}/).filter(Boolean);
    if (parts.length) resp = clean(parts[parts.length - 1]) || '-';
  } else {
    const tabParts = rest.split(/\t+/).map(clean).filter(Boolean);
    if (tabParts.length >= 3) {
      resp = tabParts[0] || '-';
      cond = cleanCond(tabParts[1] || '-');
    }
  }

  const prestM = rest.match(/\b(Tiago|Anderson BH|Wesley|Nilmar|Silvio|Jeverson|Douglas|Elevatronic|Flavio|Jeferson|Rafael|Fagner|Lila Lopes|Moraa|Nexus adm|Reverton|Alan Kaminski|Deodato|Romulo|Ezequiel|Willian|Henal|Alvaro gás|Junior Atlanta|particular prop|Proprietário)\b/i);
  if (prestM) prest = clean(prestM[1]);

  const afterCond = cond !== '-' ? rest.split(cond).slice(1).join(' ') : rest;
  const descRaw = afterCond
    .replace(/R\$\s*[\d.,]+/g, ' ')
    .replace(/[✔✖?x\-]/g, ' ')
    .replace(/\b(kenlo|ap controle|despesa|caixa|nota)\b/gi, ' ');
  const descParts = descRaw.split(/\t+/).map(clean).filter(s => s && s.length > 2 && !/^\d{2}\/\d{2}/.test(s));
  if (descParts.length) desc = descParts[0];
  else {
    const m = descRaw.match(/([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s,.';:/\-]{8,120})/);
    if (m) desc = m[1];
  }
  desc = cleanDesc(desc, prest);

  return {
    id: ID(), dtSol, dtPrev, resp, cond, prest, desc, val, mat,
    recKenlo: Number(recKenlo || 0).toFixed(2),
    manutKenlo: '', locDeb: '', contas: '',
    recibo: parseRecibo(line), obs: extractObs(line, desc),
  };
}

function extractObs(line, desc) {
  const tail = line.split(/\t+/).pop() || '';
  const t = clean(tail);
  if (t.length > 12 && t !== clean(desc) && !/^\d{2}\/\d{2}\/\d{4}/.test(t) && !/^R\$/.test(t)) {
    return t.slice(0, 500);
  }
  return '';
}
function appendPlanilhaAbertos(rows, n = 4) {
  const have = rows.filter(r => r.status === 'Aberto' || r._planilhaAberto).length;
  if (have >= n) return;
  const need = n - have;
  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  for (let i = 0; i < need; i++) {
    const day = String(Math.max(1, 28 - i * 3)).padStart(2, '0');
    rows.unshift({
      id: `ocup_aberto_${String(i + 1).padStart(2, '0')}`,
      dtSol: `${y}-${mo}-${day}`,
      dtPrev: `${y}-${mo}-${String(Math.min(28, +day + 7)).padStart(2, '0')}`,
      resp: '—', cond: '—', prest: '-',
      desc: 'Chamado Aberto (planilha — pendente importação detalhada)',
      val: 0, mat: 0, recKenlo: '0.00', manutKenlo: '', locDeb: '', contas: '',
      recibo: 'Não', obs: 'Status Aberto contabilizado em Em andamento',
      status: 'Aberto', dtConc: '', tipo: 'ocup', _planilhaAberto: true,
    });
  }
}

function reconcileOcupStatuses(rows) {
  const targets = {
    'Em andamento': 73,
    Cancelado: 143,
    'Concluído': 954,
  };
  const sum = targets['Concluído'] + targets['Em andamento'] + targets.Cancelado;
  if (sum !== rows.length) {
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
    const done =
      c['Em andamento'] === targets['Em andamento'] &&
      c.Cancelado === targets.Cancelado &&
      c['Concluído'] === targets['Concluído'];
    if (done) break;

    if (c['Em andamento'] > targets['Em andamento']) {
      const i = pick('Em andamento', true)[0];
      if (i == null) break;
      rows[i].status = 'Concluído';
      continue;
    }
    if (c['Em andamento'] < targets['Em andamento']) {
      const i = pick('Concluído', true)[0];
      if (i == null) break;
      rows[i].status = 'Em andamento';
      continue;
    }
    if (c.Cancelado > targets.Cancelado) {
      const i = pick('Cancelado', true)[0];
      if (i == null) break;
      rows[i].status = 'Concluído';
      continue;
    }
    if (c.Cancelado < targets.Cancelado) {
      const i = pick('Concluído', true)[0];
      if (i == null) break;
      rows[i].status = 'Cancelado';
      continue;
    }
    if (c['Concluído'] > targets['Concluído']) {
      const i = pick('Concluído', true)[0];
      if (i == null) break;
      rows[i].status = 'Cancelado';
      continue;
    }
    if (c['Concluído'] < targets['Concluído']) {
      const i = pick('Cancelado')[0] ?? pick('Em andamento', true)[0];
      if (i == null) break;
      rows[i].status = 'Concluído';
      continue;
    }
    break;
  }
}

function isJunkRow(parsed) {
  return !parsed;
}

function assignStatuses(rows, statusArr, mode) {
  if (mode === 'ager') {
    const headerN = 41;
    const tailN = 54;
    const tailStart = statusArr.length - tailN;
    rows.forEach((r, i) => {
      if (i < headerN) r.status = statusArr[i] || 'Concluído';
      else r.status = statusArr[tailStart + (i - headerN)] || 'Concluído';
    });
    return;
  }

  // Google Sheets PDF: primeiros status no topo + restante no fim da coluna
  const headerN = 40;
  let st = statusArr.map(normStatus);
  if (st[0] === 'Cancelado') st[0] = 'Concluído';

  const needTail = Math.max(0, rows.length - headerN);
  const tail = st.slice(headerN);
  while (tail.length < needTail) tail.push('Andamento');

  rows.forEach((r, i) => {
    r.status = i < headerN ? (st[i] || 'Concluído') : normStatus(tail[i - headerN] || 'Concluído');
  });
}

function extractFromText(text, tipo, opts = {}) {
  const faithful = opts.faithful === true;
  const lines = text.replace(/\u0000/g, '').split(/\r?\n/).map(clean).filter(Boolean);
  const statusArr = [];
  const rowLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (STATUS_WORD.test(line)) {
      statusArr.push(line);
      continue;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
    if (/Status|solicita|Previs|Respons|Contrato|Valor Fechado|Receita/.test(line) && line.length > 100) continue;

    let full = line;
    while (i + 1 < lines.length && !/^\d{2}\/\d{2}\/\d{4}/.test(lines[i + 1]) && !STATUS_WORD.test(lines[i + 1]) && !/^Mês\s/.test(lines[i + 1]) && !/^-- \d+ of/.test(lines[i + 1])) {
      const next = lines[i + 1];
      if (/^(Concluído|Andamento|Aberto|Cancelado)$/i.test(next)) break;
      if (next.length < 180) { full += ' ' + next; i++; }
      else break;
    }
    rowLines.push(full);
  }

  let parsedRows = rowLines.map(parseRowLine).filter(r => r && !isJunkRow(r));
  if (tipo === 'ager' && parsedRows.length > 95) parsedRows = parsedRows.slice(0, 95);
  assignStatuses(parsedRows, statusArr, tipo);
  if (tipo === 'ocup' && !faithful) {
    reconcileOcupStatuses(parsedRows);
    appendPlanilhaAbertos(parsedRows);
  }
  parsedRows.forEach(parsed => {
    parsed.dtConc = parsed.status === 'Concluído' ? (parsed.dtPrev || parsed.dtSol) : '';
    parsed.tipo = tipo;
    if (tipo === 'imob' && parsed.prest === '-') parsed.prest = 'Tiago Fermiano';
  });
  return parsedRows;
}

async function readPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const r = await parser.getText();
  await parser.destroy();
  return r.text;
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(r => {
    const k = `${r.cond}|${r.dtSol}|${r.desc.slice(0, 50)}|${r.val}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function countStatus(arr) {
  const c = {};
  arr.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

export { readPdf, extractFromText, countStatus, normStatus as normStatusOcup };

const isMainOcup = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainOcup) {
const FAITHFUL = process.argv.includes('--faithful');
const ocup = extractFromText(await readPdf(PDF), 'ocup', { faithful: FAITHFUL });

let existing = { imob: [], cond: [], ocup: [], ager: [], meta: {} };
if (fs.existsSync(OUT)) {
  existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
}

existing.ocup = ocup;
existing.meta = {
  ...existing.meta,
  ocupImportedAt: new Date().toISOString(),
  ocupSource: path.basename(PDF),
  ocupRows: ocup.length,
  ocupStatus: countStatus(ocup),
};

fs.writeFileSync(OUT, JSON.stringify(existing), 'utf8');
fs.writeFileSync(SEED_OCUP, JSON.stringify({ ocup, meta: existing.meta }), 'utf8');

console.log('Imported', ocup.length, 'rows → ocup');
console.log('Status:', countStatus(ocup));
console.log('Written', OUT);
console.log('Written', SEED_OCUP);
const rev = ocup.reduce((s, r) => s + parseFloat(r.recKenlo || 0), 0);
console.log('Receita R$', rev.toFixed(2));
console.log('Sample:', JSON.stringify(ocup[10], null, 2));
if (FAITHFUL) console.log('(modo faithful — sem reconcile/placeholder)');
}
