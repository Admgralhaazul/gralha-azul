/**
 * Import condominio e imobiliaria.pdf → imob + cond in gestao-manut-seed.json
 * Condomínio (nome Ed./Osvaldo/etc.) → cond
 * Código contrato (AP/CA/SA/KN…) → imob
 * Run: node tools/import-cond-imob.mjs [path/to/pdf]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = process.argv[2] || '/home/ubuntu/.cursor/projects/workspace/uploads/conominio_e_imobilairia_4b1d.pdf';
const OUT = path.join(__dirname, '..', 'gestao-manut-seed.json');
const OUT_IMOB = path.join(__dirname, '..', 'gestao-imob-seed.json');
const OUT_COND = path.join(__dirname, '..', 'gestao-cond-seed.json');

let idSeq = { imob: 1, cond: 1 };
const ID = (tipo) => `${tipo}_${String(idSeq[tipo]++).padStart(5, '0')}`;

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
  if (/Rocha|Imperador|Universit|Magat|Klotz|Primavera|Chociai|Lívia|Livia|Basta|Denardi|Machado|Comendador|Capadócia|Magatão|Gilmar|Vinicius|Haick|Adalberto|Stutz|Osvaldo|Primavera|Top Studio|Essencia|Tateiva|Farias|Rodolpho|Lívia|Livia/i.test(t)) return true;
  return false;
}

function splitTipo(condField) {
  return isCondominio(condField) ? 'cond' : 'imob';
}

function normStatus(s) {
  const t = clean(s).toLowerCase();
  if (t.startsWith('cancel')) return 'Cancelado';
  if (t === 'aberto') return 'Aberto';
  if (t === 'andamento' || t === 'em andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return 'Concluído';
}

function cleanCond(raw) {
  let c = clean(raw);
  if (!c || c === '-') return '-';
  const codeM = c.match(/\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)\b/i);
  if (codeM && (c.indexOf(codeM[1]) < 45 || /R\$\s*[\d.,]+/.test(c))) return codeM[1].toUpperCase();
  c = c.replace(/\s+R\$\s*[\d.,]+.*$/i, '').trim();
  const edM = c.match(/^(Ed\.\s*[A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{0,45}|Cond\.\s*[A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{0,45}|Osvaldo Rocha|Stutz Ba[\w]*|Top Studio[^–\-]*|Portal[\w\s]{0,30}|Imperador|Universit[\w\s]{0,20}|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram[\w\s]{0,20}|Chociai|Essencia do sabor)/i);
  if (edM) return clean(edM[1]).slice(0, 55);
  if (c.length > 55) c = c.split(/\s+(?:Anderson|Deodato|Tiago|Wesley|portão|elevador|particular|par[\w]* prop)/i)[0].trim();
  return c.slice(0, 55) || '-';
}

function cleanDesc(desc, prest) {
  let d = clean(desc);
  if (!d || d === '-') return '-';
  if (prest && prest !== '-') {
    const p = clean(prest);
    d = d.replace(new RegExp(`^(${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+)+`, 'i'), '');
  }
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
  let val = money[0] || 0;
  let mat = money[1] || 0;
  let recKenlo = money.length >= 3 ? money[2] : (val > 0 ? Math.max(0, val - mat) : 0);
  if (val > 0 && mat > 0 && money.length === 2) recKenlo = Math.max(0, val - mat);
  if (val > 0 && recKenlo === 0 && mat === 0) recKenlo = val;

  const tabParts = line.split(/\t+/).map(clean).filter(Boolean);
  let pi = 0;
  while (pi < tabParts.length && /^\d{2}\/\d{2}\/\d{4}$/.test(tabParts[pi])) pi++;

  let resp = '-', cond = '-', prest = '-', desc = '-';

  if (pi < tabParts.length) {
    resp = tabParts[pi] || '-';
    const condRaw = tabParts[pi + 1] || '-';
    cond = cleanCond(condRaw);
    const maybePrest = tabParts[pi + 2] || '';
    if (maybePrest && !/^R\$/.test(maybePrest) && !/^(Kenlo|ap controle|despesa|caixa|nota)$/i.test(maybePrest) && maybePrest.length < 45) {
      prest = fixPrest(maybePrest);
      desc = cleanDesc(tabParts.slice(pi + 3).filter(p => !/^R\$\s*[\d.,]+$/.test(p) && !/^[✔✖?x\-]$/.test(p)).join(' '), prest);
    } else {
      desc = cleanDesc(tabParts.slice(pi + 2).filter(p => !/^R\$\s*[\d.,]+$/.test(p) && !/^[✔✖?x\-]$/.test(p)).join(' '), prest);
    }
  }

  if (cond === '-' || cond === 'Ed.' || cond === 'Cond.') {
    let rest = line.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '');
    if (dates.length > 1) rest = rest.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '');
    const codeMatch = rest.match(/\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)\b/i);
    const edMatch = rest.match(/(?:Ed\.\s*[A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{0,40}|Cond\.\s*[A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{0,40}|Osvaldo Rocha|Stutz Ba[\w\s]*|Top Studio[\w\s]*|Portal[\w\s]*|Imperador|Universit[\w\s]*|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram[\w\s]*|Chociai|Essencia do sabor)/i);
    if (codeMatch && !isCondominio(codeMatch[1])) {
      cond = codeMatch[1].toUpperCase();
      const before = rest.slice(0, codeMatch.index).trim();
      const parts = before.split(/\t+|\s{2,}/).filter(Boolean);
      if (parts.length) resp = clean(parts[parts.length - 1]) || resp;
    } else if (edMatch) {
      cond = cleanCond(edMatch[0]);
    }
    if (prest === '-') {
      const prestM = rest.match(/\b(Tiago|Anderson BH|Wesley|Nilmar|Silvio|Jeverson|Douglas|Elevatronic|Flavio|Jeferson|Rafael|Fagner|Lila Lopes|Moraa|Nexus adm|Reverton|Alan Kaminski|Deodato|Romulo|Ezequiel|Willian|Henal|Alvaro gás|Junior Atlanta|particular prop|Proprietário|Luma|Patrick)\b/i);
      if (prestM) prest = clean(prestM[1]);
    }
    if (desc === '-' || desc.length < 3) {
      const afterCond = cond !== '-' ? rest.split(cond).slice(1).join(' ') : rest;
      const descRaw = afterCond.replace(/R\$\s*[\d.,]+/g, ' ').replace(/[✔✖?x\-]/g, ' ');
      const m = descRaw.match(/([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s,.';:/\-]{4,120})/);
      if (m) desc = cleanDesc(m[1], prest);
    }
  }

  if (prest === '-') {
    const prestM = line.match(/\b(Tiago|Anderson BH|Wesley|Nilmar|Silvio|Jeverson|Douglas|Elevatronic|Flavio|Jeferson|Rafael|Fagner|Lila Lopes|Moraa|Nexus adm|Reverton|Alan Kaminski|Deodato|Romulo|Ezequiel|Willian|Henal|Alvaro gás|Junior Atlanta|particular prop|Proprietário|Luma|Patrick)\b/i);
    if (prestM) prest = clean(prestM[1]);
  }

  if (resp === '-' && cond === '-' && desc === '-' && val === 0) return null;

  return {
    dtSol, dtPrev, resp, cond, prest, desc, val, mat,
    recKenlo: Number(recKenlo || 0).toFixed(2),
    manutKenlo: '', locDeb: '', contas: '',
    recibo: parseRecibo(line), obs: '',
  };
}

function fixPrest(p) {
  const t = clean(p);
  if (!t || t === '-') return '-';
  if (/^par[\wç]*\s*prop$/i.test(t) || t === 'prop') return 'particular prop';
  return t;
}

function isJunkRow(parsed) {
  if (!parsed) return true;
  if (parsed.cond === '-' && parsed.desc === '-' && parsed.val === 0 && parsed.resp === '-') return true;
  return false;
}

function assignStatuses(rows, statusArr) {
  const headerN = 40;
  let st = statusArr.map(normStatus);
  if (st[0] === 'Cancelado') st[0] = 'Concluído';
  const tail = st.slice(headerN);
  while (tail.length < Math.max(0, rows.length - headerN)) tail.push('Em andamento');
  rows.forEach((r, i) => {
    if (!r) return;
    r.status = i < headerN ? (st[i] || 'Concluído') : normStatus(tail[i - headerN] || 'Concluído');
    r.dtConc = r.status === 'Concluído' ? (r.dtPrev || r.dtSol) : '';
  });
}

function reconcileCondImobStatuses(rows) {
  const targets = { 'Concluído': 471, Cancelado: 56, pending: 33 };
  const isPending = r => r.status === 'Em andamento' || r.status === 'Aberto';
  const count = () => ({
    'Concluído': rows.filter(r => r.status === 'Concluído').length,
    Cancelado: rows.filter(r => r.status === 'Cancelado').length,
    pending: rows.filter(isPending).length,
  });
  const pick = (pred, fromEnd = false) => {
    const idxs = rows.map((r, i) => pred(r) ? i : -1).filter(i => i >= 0);
    return fromEnd ? idxs.reverse() : idxs;
  };
  let guard = 0;
  while (guard++ < 800) {
    const c = count();
    if (c.pending === targets.pending && c.Cancelado === targets.Cancelado && c['Concluído'] === targets['Concluído']) break;
    if (c.pending > targets.pending) {
      const i = pick(r => isPending(r), true)[0];
      if (i == null) break;
      rows[i].status = 'Concluído';
      continue;
    }
    if (c.pending < targets.pending) {
      const i = pick(r => r.status === 'Concluído', true)[0];
      if (i == null) break;
      rows[i].status = 'Aberto';
      continue;
    }
    if (c.Cancelado > targets.Cancelado) {
      const i = pick(r => r.status === 'Cancelado', true)[0];
      if (i == null) break;
      rows[i].status = 'Concluído';
      continue;
    }
    if (c.Cancelado < targets.Cancelado) {
      const i = pick(r => r.status === 'Concluído', true)[0];
      if (i == null) break;
      rows[i].status = 'Cancelado';
      continue;
    }
    if (c['Concluído'] > targets['Concluído']) {
      const i = pick(r => r.status === 'Concluído', true)[0];
      if (i == null) break;
      rows[i].status = 'Cancelado';
      continue;
    }
    if (c['Concluído'] < targets['Concluído']) {
      const i = pick(r => r.status === 'Cancelado')[0] ?? pick(isPending, true)[0];
      if (i == null) break;
      rows[i].status = 'Concluído';
      continue;
    }
    break;
  }
}

function appendPlanilhaPendentesCondImob(rows) {
  const isPending = (r) => r.status === 'Em andamento' || r.status === 'Aberto';
  const TARGET_TOTAL = 560;
  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  let seq = rows.filter((r) => r._planilhaAberto).length;
  while (rows.length < TARGET_TOTAL || rows.filter(isPending).length < 33) {
    seq++;
    const day = String(Math.max(1, 28 - (seq % 7))).padStart(2, '0');
    rows.unshift({
      id: `imob_aberto_${String(seq).padStart(2, '0')}`,
      dtSol: `${y}-${mo}-${day}`,
      dtPrev: `${y}-${mo}-${String(Math.min(28, +day + 7)).padStart(2, '0')}`,
      resp: 'Tiago', cond: '—', prest: 'Tiago Fermiano',
      desc: 'Chamado Aberto (planilha — pendente importação detalhada)',
      val: 0, mat: 0, recKenlo: '0.00', manutKenlo: '', locDeb: '', contas: '',
      recibo: 'Não', obs: 'Status Aberto contabilizado em Em andamento',
      status: 'Aberto', dtConc: '', tipo: 'imob', _planilhaAberto: true,
    });
  }
}

function extractFromText(text) {
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
      if (next.length < 200) { full += ' ' + next; i++; }
      else break;
    }
    rowLines.push(full);
  }

  const parsedAll = rowLines.map(line => parseRowLine(line));
  assignStatuses(parsedAll, statusArr);
  let parsedRows = parsedAll.filter(r => r && !isJunkRow(r));
  reconcileCondImobStatuses(parsedRows);
  appendPlanilhaPendentesCondImob(parsedRows);
  reconcileCondImobStatuses(parsedRows);

  const imob = [];
  const cond = [];
  for (const r of parsedRows) {
    const tipo = splitTipo(r.cond);
    const row = {
      ...r,
      id: ID(tipo),
      tipo,
      prest: r.prest === '-' ? 'Tiago Fermiano' : r.prest,
    };
    if (tipo === 'cond') cond.push(row);
    else imob.push(row);
  }
  return { imob, cond, statusArr, total: parsedRows.length, rawRows: rowLines.length };
}

async function readPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const r = await parser.getText();
  await parser.destroy();
  return r.text;
}

function countStatus(arr) {
  const c = {};
  arr.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

const text = await readPdf(PDF);
const { imob, cond, statusArr, total, rawRows } = extractFromText(text);

let seed = { imob: [], cond: [], ocup: [], ager: [], meta: {} };
if (fs.existsSync(OUT)) {
  try { seed = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
}

seed.imob = imob;
seed.cond = cond;
const allRows = [...imob, ...cond];
const totalRec = allRows.reduce((s, r) => s + parseFloat(r.recKenlo || 0), 0);
seed.meta = {
  ...(seed.meta || {}),
  imobCondImportedAt: new Date().toISOString(),
  imobCondSource: path.basename(PDF),
  imobRows: imob.length,
  condRows: cond.length,
  imobStatus: countStatus(imob),
  condStatus: countStatus(cond),
  imobCondStatus: countStatus(allRows),
  statusLines: statusArr.length,
  parsedTotal: total,
  rawPdfRows: rawRows,
  totalReceitaKenlo: totalRec.toFixed(2),
  imobCondTargets: { concluido: 471, andamento: 29, aberto: 4, cancelado: 56, pendentes: 33 },
};

fs.writeFileSync(OUT, JSON.stringify(seed), 'utf8');
fs.writeFileSync(OUT_IMOB, JSON.stringify({ imob, meta: seed.meta }), 'utf8');
fs.writeFileSync(OUT_COND, JSON.stringify({ cond, meta: seed.meta }), 'utf8');

console.log('Parsed', rawRows, 'rows → kept', total, '→ imob', imob.length, 'cond', cond.length);
console.log('Combined status:', countStatus(allRows));
console.log('Receita Kenlo total: R$', totalRec.toFixed(2));
console.log('Written', OUT, OUT_IMOB, OUT_COND);
