/**
 * Import "Luma Oficial" from Manutenções Imóveis Ocupados Excel → gestao-ocup-seed.json
 * Run: node tools/import-ocup-xlsx.mjs [path/to.xlsx]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const XLSX_PATH =
  process.argv.find((a) => a.endsWith('.xlsx') || a.endsWith('.xls')) ||
  '/home/ubuntu/.cursor/projects/workspace/uploads/Manuten__es_Im_veis_Ocupados___Condom_nios_2025__4__358b.xlsx';
const SHEET = process.argv.find((a) => a.startsWith('--sheet='))?.slice(8) || 'Luma Oficial';
const OUT = path.join(ROOT, 'gestao-manut-seed.json');
const OUT_OCUP = path.join(ROOT, 'gestao-ocup-seed.json');

function clean(s) {
  return String(s ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function excelDate(n) {
  if (n === '' || n == null) return '';
  if (typeof n === 'number') {
    const d = XLSX.SSF.parse_date_code(n);
    if (!d) return '';
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const t = clean(n);
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

function parseMoney(v) {
  if (v === '' || v == null || v === '-' || v === 'x' || v === 'X') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = clean(String(v))
    .replace(/R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function normStatus(s) {
  const t = clean(s).toLowerCase();
  if (t.startsWith('cancel')) return 'Cancelado';
  if (t === 'aberto') return 'Aberto';
  if (t === 'andamento' || t === 'em andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return '';
}

function parseRecibo(v) {
  const t = clean(String(v));
  if (!t || t === '-' || t === 'x' || t === 'X' || t === '✖' || t === '✗' || t === '✖️') return 'Não';
  if (/✔|✔️|sim|caixa|nota/i.test(t)) return 'Sim';
  return 'Não';
}

function isStatusRow(st) {
  return !!normStatus(st);
}

function countStatus(arr) {
  const c = {};
  arr.forEach((r) => {
    c[r.status] = (c[r.status] || 0) + 1;
  });
  return c;
}

function parseSheet(wb, sheetName) {
  const sh = wb.Sheets[sheetName];
  if (!sh) throw new Error(`Aba não encontrada: ${sheetName}. Disponíveis: ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const headerIdx = rows.findIndex(
    (r) => clean(r[1]).toLowerCase() === 'status' && /data/i.test(clean(r[2])),
  );
  if (headerIdx < 0) throw new Error('Cabeçalho Status/Data não encontrado');

  const out = [];
  let idSeq = 1;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const stRaw = clean(row[1]);
    if (!stRaw || /^mês$/i.test(stRaw) || /^mes$/i.test(stRaw)) continue;
    const status = normStatus(stRaw);
    if (!status) continue;

    const dtSol = excelDate(row[2]);
    const dtPrev = excelDate(row[3]) || excelDate(row[9]) || dtSol;
    const resp = clean(row[4]) || '—';
    const cond = clean(row[5]) || '-';
    const prest = clean(row[7]) || '-';
    const desc = clean(row[8]) || '-';
    const val = parseMoney(row[10]);
    const mat = parseMoney(row[11]);
    let rec = parseMoney(row[12]);
    if (!rec && val > 0) rec = Math.max(0, val - mat);
    const manutKenlo = clean(row[13]);
    const locDeb = clean(row[14]);
    const contas = clean(row[15]);
    const recibo = parseRecibo(row[16]);
    const obs = clean(row[17]);

    // skip empty junk
    if (cond === '-' && desc === '-' && val === 0 && !dtSol) continue;

    out.push({
      id: 'ocup_' + String(idSeq++).padStart(5, '0'),
      dtSol,
      dtPrev,
      resp,
      cond,
      prest: prest === '-' ? '-' : prest,
      desc,
      val,
      mat,
      recKenlo: rec.toFixed(2),
      manutKenlo,
      locDeb,
      contas,
      recibo,
      obs,
      status,
      dtConc: status === 'Concluído' ? dtPrev || dtSol : '',
      tipo: 'ocup',
      _source: 'xlsx_luma_oficial',
      _sheet: sheetName,
      _row: i + 1,
    });
  }
  return out;
}

const wb = XLSX.readFile(XLSX_PATH);
const ocup = parseSheet(wb, SHEET);

let seed = { imob: [], cond: [], ocup: [], ager: [], meta: {} };
if (fs.existsSync(OUT)) {
  try {
    seed = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch (e) {}
}

seed.ocup = ocup;
seed.meta = {
  ...(seed.meta || {}),
  ocupImportedAt: new Date().toISOString(),
  ocupSource: path.basename(XLSX_PATH),
  ocupSheet: SHEET,
  ocupRows: ocup.length,
  ocupStatus: countStatus(ocup),
  ocupFaithful: true,
};

fs.writeFileSync(OUT, JSON.stringify(seed), 'utf8');
fs.writeFileSync(OUT_OCUP, JSON.stringify({ ocup, meta: seed.meta }), 'utf8');

const pend = (countStatus(ocup)['Em andamento'] || 0) + (countStatus(ocup).Aberto || 0);
console.log('Sheet:', SHEET);
console.log('Imported', ocup.length, '→ ocup');
console.log('Status:', countStatus(ocup));
console.log('Pendentes (Andamento+Aberto):', pend);
console.log('Receita R$', ocup.reduce((s, r) => s + parseFloat(r.recKenlo || 0), 0).toFixed(2));
console.log('Written', OUT_OCUP);
console.log('Sample:', JSON.stringify(ocup[0], null, 2));
