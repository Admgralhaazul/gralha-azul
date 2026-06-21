/**
 * Parse maintenance PDF exports into gestao DB records.
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
  return (s || '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoney(s) {
  if (!s) return 0;
  const m = s.match(/R\$\s*([\d.,]+)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0;
}

function brToIso(d) {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const CODE_RE = /^(?:[A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?|kn\d+(?:\/\d+)?)$/i;
const COND_HINT = /^(?:Ed\.|Cond\.|Res\.|Portal|Top Studio|Stutz|Osvaldo|Universit|Imperador|Magat|Machado|Rocha|Klotz|Rodolpho|Tateiva|Farias|Denardi|Primavera|Comendador|Capad|Haick|Studio|Vinicius|Gilmar|Padre|Adalberto)/i;

function isContractCode(s) {
  const t = clean(s);
  if (!t || t === '-' || t === 'x') return false;
  if (CODE_RE.test(t.replace(/\s/g, ''))) return true;
  if (/^[A-Z]{2}\d{3,4}$/i.test(t)) return true;
  return false;
}

function isCondominio(s) {
  const t = clean(s);
  if (!t || t === '-') return false;
  if (isContractCode(t)) return false;
  if (COND_HINT.test(t)) return true;
  if (/^Ed\.|^Cond\.|^Res\./i.test(t)) return true;
  if (/\bEd\.\s/i.test(t)) return true;
  if (/condom[ií]nio/i.test(t)) return true;
  // Names without slash/code pattern, not a person-only field
  if (!/\//.test(t) && !/^\d/.test(t) && t.length > 4 && !/^(Tiago|Luma|Ana|Patrick|Allan|Kamile|Aline|Jô|Jô\/Kamile)$/i.test(t)) {
    if (/^(Ed\.|Top|Portal|Cond\.)/i.test(t)) return true;
    if (/Rocha|Imperador|Universit|Magatão|Machado|Klotz|Studio|Baista|Baista|Tateiva|Magat/i.test(t)) return true;
  }
  return false;
}

function splitTiago(condField) {
  return isCondominio(condField) ? 'cond' : 'imob';
}

function inferStatus(line, desc) {
  const l = (line + ' ' + desc).toLowerCase();
  if (/cancelad/.test(l)) return 'Cancelado';
  if (/conclu[ií]do|finalizad|realizado|já esta finalizado|ja esta finalizado/.test(l)) return 'Concluído';
  if (/andamento|aberto|pendente|aguardando|sem retorno|cobrad/.test(l)) return 'Em andamento';
  return 'Concluído';
}

function parseRecibo(line) {
  if (/✔|Sim|caixa|nota/.test(line) && !/✖|✗|x x/.test(line)) return 'Sim';
  if (/✖|✗/.test(line)) return 'Não';
  return 'Não';
}

function extractRows(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const rows = [];
  const dateStart = /^\d{2}\/\d{2}\/\d{4}/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!dateStart.test(line)) continue;
    if (/Status|solicita|Previs|Respons|Contrato|Valor Fechado|Concluído\s+\d+\s+\d+/.test(line) && line.length > 120) continue;

    // Merge continuation lines until next date row or section header
    while (i + 1 < lines.length && !dateStart.test(lines[i + 1]) && !/^IMÓVEIS|^IM.VEIS|^P\s*$|^-- \d+ of/.test(lines[i + 1])) {
      if (lines[i + 1].length < 200) {
        line += ' ' + lines[i + 1];
        i++;
      } else break;
    }

    const dates = [...line.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
    if (!dates.length) continue;
    const dtSol = dates[0];
    const dtPrev = dates[1] || dates[0];

    let rest = line.slice(line.indexOf(dates[dates.length > 1 ? 1 : 0]) + (dates.length > 1 ? 10 : 10));
    if (dates.length === 1) rest = line.slice(10);

    // Try to find contract/cond token
    const tokens = rest.split(/\t+|\s{2,}/).map(clean).filter(Boolean);
    if (!tokens.length) {
      // fallback: split by spaces after removing dates
      const raw = line.replace(/\d{2}\/\d{2}\/\d{4}/g, ' ').trim();
      tokens.push(...raw.split(/\s+/));
    }

    let resp = '';
    let cond = '';
    let prest = '';
    let desc = '';
    let val = 0;
    let mat = 0;

    // Find first money or code-like token
    const moneyParts = [...line.matchAll(/R\$\s*[\d.,]+/g)];
    if (moneyParts.length) {
      val = parseMoney(moneyParts[0][0]);
      mat = moneyParts[1] ? parseMoney(moneyParts[1][0]) : 0;
    }

    const codeMatch = rest.match(/\b([A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?|kn\d+(?:\/\d+)?|CA\d{3,4}(?:\/\d+)?)\b/i);
    const edMatch = rest.match(/(?:Ed\.|Cond\.|Top Studio|Osvaldo Rocha|Stutz Ba[\w]*|Portal[\w\s]*|Imperador|Universit[\w]*|Magat[\w]*|Machado|Rocha|Klotz|Rodolpho|Tateiva|Farias[\w\s]*|Vinicius[\w\s]*|Gilmar[\w\s]*|Padre[\w\s]*|Paulo Klotz)[^\t]{0,60}/i);

    if (codeMatch && !isCondominio(codeMatch[1])) {
      cond = codeMatch[1].toUpperCase();
      const before = rest.slice(0, codeMatch.index).trim();
      const respM = before.match(/(?:^|\s)([A-Za-zÀ-ú\/\.\s]{2,30}?)\s*$/);
      resp = respM ? clean(respM[1]) : '';
    } else if (edMatch) {
      cond = clean(edMatch[0]);
      const before = rest.slice(0, edMatch.index).trim();
      const respM = before.match(/([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s*$/);
      resp = respM ? clean(respM[1]) : '';
    } else {
      // Person names at start
      const parts = rest.split(/\s+/);
      resp = parts[0] || '';
      cond = parts.slice(1, 3).join(' ') || parts[1] || '';
    }

    // Prestador: common names
    const prestM = rest.match(/\b(Tiago|Anderson BH|Wesley|Nilmar|Silvio|Jeverson|Douglas|Elevatronic|Flavio|Jeferson|Rafael|Fagner|Lila Lopes|Mora[\w]*|Nexus adm|par[\w]* prop|par[\w]*|particular)\b/i);
    if (prestM) prest = clean(prestM[1]);

    // Description: text between cond and R$
    const descMatch = rest.match(/(?:\/\d+|Rocha|Imperador|Studio|Machado|\d{4})\s+(.+?)(?:\s+R\$|\s+-\s+-|\s+kenlo|\s+ap controle|$)/i);
    if (descMatch) desc = clean(descMatch[1]);
    if (!desc) {
      const afterCond = rest.split(cond).slice(1).join(cond);
      desc = clean(afterCond.replace(/R\$\s*[\d.,]+/g, '').replace(/[✔✖?x-]/g, ' ').slice(0, 120));
    }

    const status = inferStatus(line, desc);
    const recibo = parseRecibo(line);
    const recKenlo = val && mat ? (val - mat).toFixed(2) : val ? val.toFixed(2) : '0';

    rows.push({
      id: ID(),
      status,
      dtSol: brToIso(dtSol),
      dtPrev: brToIso(dtPrev),
      dtConc: status === 'Concluído' ? brToIso(dtPrev) : '',
      resp: resp || '-',
      cond: cond || '-',
      prest: prest || '-',
      desc: desc || '-',
      val,
      mat,
      recKenlo,
      manutKenlo: '',
      locDeb: '',
      contas: '',
      recibo,
      obs: '',
    });
  }
  return rows;
}

async function readPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const r = await parser.getText();
  await parser.destroy();
  return r.text.replace(/\u0000/g, '');
}

const result = { imob: [], cond: [], ocup: [], ager: [], meta: { importedAt: new Date().toISOString() } };

const ocupText = await readPdf(PDFS.ocup);
result.ocup = extractRows(ocupText).map(r => ({ ...r, tipo: 'ocup' }));

const agerText = await readPdf(PDFS.ager);
result.ager = extractRows(agerText).map(r => ({ ...r, tipo: 'ager' }));

const tiagoText = await readPdf(PDFS.tiago);
for (const r of extractRows(tiagoText)) {
  const tipo = splitTiago(r.cond);
  result[tipo].push({ ...r, tipo, prest: r.prest === '-' ? 'Tiago Fermiano' : r.prest });
}

// Dedupe by cond+dtSol+desc
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(r => {
    const k = `${r.cond}|${r.dtSol}|${r.desc.slice(0, 40)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

for (const k of ['imob', 'cond', 'ocup', 'ager']) {
  result[k] = dedupe(result[k]);
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 0), 'utf8');
console.log('Written', OUT);
for (const k of ['imob', 'cond', 'ocup', 'ager']) {
  const arr = result[k];
  const rev = arr.reduce((s, r) => s + (r.val || 0), 0);
  console.log(k + ':', arr.length, 'records, receita total R$', rev.toFixed(2));
}
