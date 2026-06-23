/**
 * Import "Manutenções Imóveis Ocupados + Condomínios" PDF → gestao-manut-seed.json (ager only)
 * Run: node tools/import-ager-ocup-cond.mjs
 */
import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const PDF = 'C:/Users/Kamile/Downloads/Manutenções Imóveis Ocupados + Condomínios 2025 - Google Planilhas.pdf';
const OUT = 'C:/Users/Kamile/Projects/gralha-azul/gestao-manut-seed.json';

let idSeq = 1;
const ID = () => 'ager_' + String(idSeq++).padStart(4, '0');

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

const CODE_RE = /\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?|Ap\d+(?:\/\d+)?|ap\d+(?:\/\d+)?)\b/i;

function isCondominio(s) {
  const t = clean(s);
  if (!t || t === '-') return false;
  if (CODE_RE.test(t.replace(/\s/g, ''))) return false;
  return /^(Ed\.|Cond\.|Cond|Condomínio|Res\.|Portal|Top Studio|Stutz|Osvaldo|Universit|Imperador|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram|Chociai|Essencia|Ribeiro|Rocha|Magat|Primavera|Chociai|Lívia|Livia|Comendador|Capadócia|Haick|Gilmar|Vinicius|Denardi|Machado|Adalberto)/i.test(t);
}

function cleanCond(raw) {
  let c = clean(raw);
  if (!c || c === '-' || c === 'x') return '-';
  const codeM = c.match(CODE_RE);
  if (codeM) return codeM[1].toUpperCase().replace(/^AP/, 'AP');
  c = c.replace(/\s+R\$\s*[\d.,]+.*$/i, '').trim();
  const edM = c.match(/^(Ed\.[^–\-]+?|Cond\.[^–\-]+?|Condomínio[^–\-]+?|Osvaldo Rocha|Stutz Ba[\w]*|Top Studio[^–\-]*|Portal[\w\s]{0,30}|Imperador|Universit[\w\s]{0,20}|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram[\w\s]{0,20}|Chociai|Essencia do sabor|Ribeiro)/i);
  if (edM) return clean(edM[1]).slice(0, 55);
  return c.slice(0, 55) || '-';
}

function cleanDesc(desc, prest) {
  let d = clean(desc);
  if (!d || d === '-') return '-';
  d = d.replace(/\s*passado pra Ana em\s*[\d/]*\s*(?:-\s*SEM RETORNO)?/gi, '');
  d = d.replace(/\s*SEM RETORNO\s*/gi, ' ').trim();
  if (prest && prest !== '-') {
    const p = clean(prest);
    d = d.replace(new RegExp(`^(${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+)+`, 'i'), '');
  }
  d = d.replace(/\b(\w{3,})(?:\s+\1\b)+/gi, '$1');
  return clean(d).slice(0, 220) || '-';
}

function normStatus(s) {
  const t = clean(s).toLowerCase();
  if (t === 'cancelado' || t.startsWith('cancela')) return 'Cancelado';
  if (t === 'aberto' || t === 'andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return 'Em andamento';
}

function parseRecibo(line) {
  if (/✔|Sim|caixa|nota/.test(line) && !/✖|✗/.test(line)) return 'Sim';
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

  const codeMatch = rest.match(CODE_RE);
  const edMatch = rest.match(/(?:Ed\.|Cond\.|Condomínio|Osvaldo Rocha|Stutz Ba[\w]*|Top Studio|Portal[\w\s]*|Imperador|Universit[\w\s]*|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram[\w\s]*|Chociai|Essencia do sabor|Ribeiro)[^\t]{0,60}/i);

  let resp = 'Ana', cond = '-', prest = '-', desc = '-', obs = '';

  if (codeMatch && !isCondominio(codeMatch[1])) {
    cond = cleanCond(codeMatch[1]);
    const before = rest.slice(0, codeMatch.index).trim();
    const parts = before.split(/\t+|\s{2,}/).filter(Boolean);
    if (parts.length) resp = clean(parts[parts.length - 1]) || 'Ana';
  } else if (edMatch) {
    cond = cleanCond(edMatch[0]);
    const before = rest.slice(0, edMatch.index).trim();
    const parts = before.split(/\t+|\s{2,}/).filter(Boolean);
    if (parts.length) resp = clean(parts[parts.length - 1]) || 'Ana';
  } else {
    const tabParts = rest.split(/\t+/).map(clean).filter(Boolean);
    if (tabParts.length >= 2) {
      resp = tabParts.find(p => /^Ana$/i.test(p)) || tabParts[0] || 'Ana';
      const condPart = tabParts.find(p => CODE_RE.test(p) || isCondominio(p));
      if (condPart) cond = cleanCond(condPart);
    }
  }

  const prestM = rest.match(/\b(Tiago|Anderson BH|Wesley|Nilmar|Silvio|Jeverson|Jeferson|Douglas|Elevatronic|Flavio|Jeferson|Rafael|Fagner|Lila Lopes|Moraa|Nexus adm|Reverton|Alan Kaminski|Deodato|Romulo|Ezequiel|Willian|Henal|Alvaro gás|Junior Atlanta|particular prop|par[\w]* prop|Proprietário|prop|construtora|administradora|engenheiro prop|sindica|Beltrão|Siakseg|Prestes|prestes|Luis|Wesley|infiltrações)\b/i);
  if (prestM) prest = clean(prestM[1]);

  const afterCond = cond !== '-' ? rest.split(cond).slice(1).join(' ') : rest;
  const descRaw = afterCond
    .replace(/R\$\s*[\d.,]+/g, ' ')
    .replace(/[✔✖?x\-]/g, ' ')
    .replace(/\b(kenlo|ap controle|despesa|caixa|nota)\b/gi, ' ');

  const obsMatch = line.match(/(?:passado pra Ana|Prop |inquilino |será realizado|chamado cancelado|não precisou|orçamento aprovado|Caso voltou)[^.]{0,200}/i);
  if (obsMatch) obs = clean(obsMatch[0]).slice(0, 300);

  const descParts = descRaw.split(/\t+/).map(clean).filter(s => s && s.length > 2 && !/^\d{2}\/\d{2}/.test(s) && !/^Ana$/i.test(s));
  if (descParts.length) desc = descParts[0];
  else {
    const m = descRaw.match(/([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s,.';:/\-]{4,120})/);
    if (m) desc = m[1];
  }
  desc = cleanDesc(desc, prest);

  if (cond === '-' && desc === '-' && val === 0) return null;

  return {
    id: ID(), tipo: 'ager', dtSol, dtPrev, resp, cond, prest, desc, val, mat,
    recKenlo: Number(recKenlo || 0).toFixed(2),
    manutKenlo: '', locDeb: '', contas: '',
    recibo: parseRecibo(line), obs,
  };
}

function isStatusLine(line) {
  const t = clean(line);
  return /^(Concluído|Concluido|Andamento|Aberto|Cancelado|Cancela…)$/i.test(t);
}

function collectStatuses(lines) {
  const statuses = [];
  for (const line of lines) {
    if (!isStatusLine(line)) continue;
    if (/^Cancela…$/i.test(line)) continue;
    statuses.push(normStatus(line));
  }
  return statuses;
}

function assignStatusesAger(rows, statusArr) {
  let st = [...statusArr];
  if (st[0] === 'Cancelado' && st.length > rows.length) st = st.slice(1);
  const headerN = 40;
  const tail = st.slice(headerN);
  rows.forEach((r, i) => {
    if (i < headerN) r.status = st[i] || 'Concluído';
    else r.status = tail[i - headerN] || 'Concluído';
  });
}

function isJunkRow(r) {
  if (!r) return true;
  const d = clean(r.desc).toLowerCase();
  if (r.cond === '-' && (d === 'sem retorno' || d === '-' || d.length < 4)) return true;
  if (/^sem retorno$/i.test(r.desc)) return true;
  return false;
}

function fixPrest(p) {
  const t = clean(p);
  if (/^par[\w]*\s*prop$/i.test(t)) return 'particular prop';
  if (t === 'prop') return 'particular prop';
  if (t === 'parcial prop') return 'particular prop';
  return t === '-' ? '' : t;
}

function extractFromText(text) {
  const lines = text.replace(/\u0000/g, '').split(/\r?\n/).map(clean).filter(Boolean);
  const statusArr = collectStatuses(lines);
  const rowLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isStatusLine(line)) continue;
    if (!/^\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
    if (/Status|solicita|Previs|Respons|Contrato|Valor Fechado|Receita/.test(line) && line.length > 100) continue;

    let full = line;
    while (i + 1 < lines.length && !/^\d{2}\/\d{2}\/\d{4}/.test(lines[i + 1]) && !isStatusLine(lines[i + 1]) && !/^Mês\s/.test(lines[i + 1]) && !/^-- \d+ of/.test(lines[i + 1])) {
      const next = lines[i + 1];
      if (isStatusLine(next)) break;
      if (next.length < 220) { full += ' ' + next; i++; }
      else break;
    }
    // Continuação "passado pra Ana em DD/MM/YYYY" na linha seguinte
    if (i + 1 < lines.length && /^\d{2}\/\d{2}\/\d{4}/.test(lines[i + 1])) {
      const next = lines[i + 1];
      if (/passado pra Ana|SEM RETORNO|Prop |inquilino |chamado cancelado|não precisou|orçamento aprovado/i.test(next) && !/\b(SA|AP|CA|KN|SO)\d/i.test(next)) {
        full += ' ' + next;
        i++;
      }
    }
    rowLines.push(full);
  }

  let rows = rowLines.map(parseRowLine).filter(r => r && !isJunkRow(r));
  rows.forEach(r => { r.prest = fixPrest(r.prest); });
  assignStatusesAger(rows, statusArr);

  rows.forEach(r => {
    r.dtConc = r.status === 'Concluído' ? (r.dtPrev || r.dtSol) : '';
    if (r.prest === '-') r.prest = '';
  });

  return { rows, statusCount: statusArr.length, rowCount: rows.length };
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
const { rows, statusCount, rowCount } = extractFromText(text);

let seed = { imob: [], cond: [], ocup: [], ager: [], meta: {} };
if (fs.existsSync(OUT)) {
  try { seed = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
}
seed.ager = rows;
seed.meta = {
  ...(seed.meta || {}),
  agerImportedAt: new Date().toISOString(),
  agerSource: path.basename(PDF),
  agerStatusLines: statusCount,
  agerRows: rowCount,
};

fs.writeFileSync(OUT, JSON.stringify(seed), 'utf8');
console.log('Written', OUT);
console.log('ager:', rows.length, countStatus(rows), `(status lines: ${statusCount})`);
if (statusCount !== rowCount) console.warn('WARN: status/row count mismatch');
