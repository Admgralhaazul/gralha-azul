/**
 * Parse maintenance PDF exports into gestao-manut-seed.json
 * Run: node tools/import-manut-from-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const PDF_DIR = 'C:/Users/Kamile/Downloads';
const OUT = 'C:/Users/Kamile/Projects/gralha-azul/gestao-manut-seed.json';

const PDFS = {
  ocup: path.join(PDF_DIR, 'Manutenções Imóveis Ocupados geral.pdf'),
  ager: path.join(PDF_DIR, 'manutenções assistente adm.pdf'),
  tiago: path.join(PDF_DIR, 'manitenções tiago (executadas pela imob e condomínios).pdf'),
};

let idSeq = 1;
const ID = () => 'seed_' + (idSeq++);

function clean(s) {
  return (s || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function parseMoney(s) {
  const parts = [...String(s).matchAll(/R\$\s*([\d.,]+)/g)];
  return parts.map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0);
}

function brToIso(d) {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const y = +m[3], mo = +m[2], da = +m[1];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const CODE_RE = /^(?:[A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)$/i;
const STATUS_WORD = /^(Concluído|Concluido|Andamento|Aberto|Cancelado)$/i;

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
  if (t === 'cancelado') return 'Cancelado';
  if (t === 'aberto') return 'Aberto';
  if (t === 'andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return 'Concluído';
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

  if (resp === '-' && cond === '-' && desc === '-' && val === 0) return null;

  return {
    id: ID(), dtSol, dtPrev, resp, cond, prest, desc, val, mat,
    recKenlo: Number(recKenlo || 0).toFixed(2),
    manutKenlo: '', locDeb: '', contas: '',
    recibo: parseRecibo(line), obs: '',
  };
}

function isJunkRow(parsed) {
  if (!parsed) return true;
  if (parsed.cond === '-' && parsed.desc === '-' && parsed.val === 0 && parsed.resp === '-') return true;
  return false;
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
  let st = statusArr;
  if (st.length > rows.length) st = st.slice(st.length - rows.length);
  rows.forEach((r, i) => { r.status = st[i] || 'Concluído'; });
}

function extractFromText(text, tipo) {
  const lines = text.replace(/\u0000/g, '').split(/\r?\n/).map(clean).filter(Boolean);
  const statusArr = [];
  const rowLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (STATUS_WORD.test(line)) {
      statusArr.push(normStatus(line));
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

const result = { imob: [], cond: [], ocup: [], ager: [], meta: { importedAt: new Date().toISOString() } };

result.ocup = extractFromText(await readPdf(PDFS.ocup), 'ocup');
result.ager = extractFromText(await readPdf(PDFS.ager), 'ager');

const tiagoText = await readPdf(PDFS.tiago);
for (const r of extractFromText(tiagoText, 'imob')) {
  const t = splitTiago(r.cond);
  result[t].push({ ...r, tipo: t, prest: r.prest === '-' ? 'Tiago Fermiano' : r.prest });
}

for (const k of ['imob', 'cond', 'ocup', 'ager']) {
  result[k] = dedupe(result[k]);
}

fs.writeFileSync(OUT, JSON.stringify(result), 'utf8');
console.log('Written', OUT);
for (const k of ['imob', 'cond', 'ocup', 'ager']) {
  const arr = result[k];
  const rev = arr.reduce((s, r) => s + parseFloat(r.recKenlo || 0), 0);
  console.log(k + ':', arr.length, countStatus(arr), 'receita R$', rev.toFixed(2));
}
