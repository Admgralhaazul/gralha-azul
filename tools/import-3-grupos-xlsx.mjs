/**
 * Importa planilhas Excel em 3 grupos:
 *  1) Imóveis Ocupados     → Luma Oficial     → ocup
 *  2) Assistente ADM       → Ana Oficial      → ager
 *  3) Cond + Imobiliária   → Tiago Oficial    → cond / imob (split)
 *
 * Aberto → Em andamento (sempre)
 *
 * Run:
 *   node tools/import-3-grupos-xlsx.mjs
 *   node tools/import-3-grupos-xlsx.mjs --ocup=path.xlsx --ager=path.xlsx --imobcond=path.xlsx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UP = '/home/ubuntu/.cursor/projects/workspace/uploads';

function argPath(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : fallback;
}

const PATH_OCUP = argPath('ocup', path.join(UP, 'Manuten__es_Im_veis_Ocupados___Condom_nios_2025__4__358b.xlsx'));
const PATH_AGER = argPath('ager', path.join(UP, 'Manuten__es_Im_veis_Ocupados___Condom_nios_2025__8__e64c.xlsx'));
const PATH_IMOBCOND = argPath('imobcond', path.join(UP, 'Manuten__es_Im_veis_Ocupados___Condom_nios_2025__9__d791.xlsx'));

const OUT = path.join(ROOT, 'gestao-manut-seed.json');
const OUT_OCUP = path.join(ROOT, 'gestao-ocup-seed.json');
const OUT_AGER = path.join(ROOT, 'gestao-ager-seed.json');
const OUT_IMOB = path.join(ROOT, 'gestao-imob-seed.json');
const OUT_COND = path.join(ROOT, 'gestao-cond-seed.json');

const CODE_RE = /^(?:[A-Z]{2}\d{3,4}(?:\/\d+)?|KN\d+(?:\/\d+)?)$/i;

function clean(s) {
  return String(s ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
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
  const t = clean(String(v)).replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Aberto sempre vira Em andamento */
function normStatus(s) {
  const t = clean(s).toLowerCase();
  if (t.startsWith('cancel')) return 'Cancelado';
  if (t === 'aberto' || t === 'atrasado' || t === 'andamento' || t === 'em andamento') return 'Em andamento';
  if (t === 'concluído' || t === 'concluido') return 'Concluído';
  return '';
}

function parseRecibo(v) {
  const t = clean(String(v));
  if (!t || t === '-' || t === 'x' || t === 'X' || t === '✖' || t === '✗' || t === '✖️') return 'Não';
  if (/✔|✔️|sim|caixa|nota/i.test(t)) return 'Sim';
  return 'Não';
}

function isContractCode(s) {
  const t = clean(s).replace(/\s/g, '');
  if (!t || t === '-' || t === 'x' || t === '—') return false;
  return CODE_RE.test(t);
}

function isCondominio(s) {
  const t = clean(s);
  if (!t || t === '-' || t === 'x' || t === '—') return false;
  if (isContractCode(t)) return false;
  if (/^(Ed\.|Cond\.|Res\.|Portal|Top Studio|Stutz|Osvaldo|Universit|Imperador|Paulo Klotz|Rodolpho|Tateiva|Farias|Instagram|Chociai|Essencia|Haick|Comendador|Capadócia|Magatão|Gilmar|Vinicius|Adalberto|Lívia|Livia)/i.test(t)) return true;
  if (/Rocha|Imperador|Universit|Magat|Klotz|Primavera|Chociai|Lívia|Livia|Denardi|Machado|Comendador|Capadócia|Magatão|Gilmar|Vinicius|Haick|Adalberto|Stutz|Osvaldo|Top Studio|Essencia|Tateiva|Farias|Rodolpho/i.test(t)) return true;
  return false;
}

function splitTipo(condField) {
  return isCondominio(condField) ? 'cond' : 'imob';
}

function countStatus(arr) {
  const c = {};
  arr.forEach((r) => {
    c[r.status] = (c[r.status] || 0) + 1;
  });
  return c;
}

function parseSheet(wb, sheetName, tipoPrefix) {
  const sh = wb.Sheets[sheetName];
  if (!sh) throw new Error(`Aba não encontrada: ${sheetName}. Disponíveis: ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const headerIdx = rows.findIndex(
    (r) => clean(r[1]).toLowerCase() === 'status' && /data/i.test(clean(r[2])),
  );
  if (headerIdx < 0) throw new Error(`Cabeçalho Status/Data não encontrado em ${sheetName}`);

  const out = [];
  let idSeq = 1;
  let abertoConverted = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const stRaw = clean(row[1]);
    if (!stRaw || /^mês$/i.test(stRaw) || /^mes$/i.test(stRaw)) continue;
    if (/^aberto$/i.test(stRaw)) abertoConverted++;
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

    if (cond === '-' && desc === '-' && val === 0 && !dtSol) continue;

    const tipo = tipoPrefix === 'split' ? splitTipo(cond) : tipoPrefix;
    const idBase = tipo === 'ager' ? 'ager' : tipo;
    const pad = tipo === 'ager' ? 4 : 5;

    out.push({
      id: `${idBase}_` + String(idSeq++).padStart(pad, '0'),
      dtSol,
      dtPrev,
      resp,
      cond,
      prest,
      desc,
      val,
      mat,
      recKenlo: rec.toFixed(2),
      manutKenlo: clean(row[13]),
      locDeb: clean(row[14]),
      contas: clean(row[15]),
      recibo: parseRecibo(row[16]),
      obs: clean(row[17]),
      status,
      dtConc: status === 'Concluído' ? dtPrev || dtSol : '',
      tipo,
      _source: 'xlsx_3_grupos',
      _sheet: sheetName,
      _row: i + 1,
      _statusOriginal: stRaw,
    });
  }
  // Re-number IDs per tipo after split
  if (tipoPrefix === 'split') {
    const seq = { imob: 1, cond: 1 };
    for (const r of out) {
      r.id = `${r.tipo}_` + String(seq[r.tipo]++).padStart(5, '0');
    }
  }
  return { rows: out, abertoConverted };
}

function loadSeed() {
  let seed = { imob: [], cond: [], ocup: [], ager: [], meta: {} };
  if (fs.existsSync(OUT)) {
    try {
      seed = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    } catch (e) {}
  }
  return seed;
}

const seed = loadSeed();
const now = new Date().toISOString();

// 1) OCUP — Luma Oficial
const wbOcup = XLSX.readFile(PATH_OCUP);
const ocupParsed = parseSheet(wbOcup, 'Luma Oficial', 'ocup');
seed.ocup = ocupParsed.rows;

// 2) AGER — Ana Oficial (arquivo 8)
const wbAger = XLSX.readFile(PATH_AGER);
const agerParsed = parseSheet(wbAger, 'Ana Oficial', 'ager');
seed.ager = agerParsed.rows;

// 3) IMOB + COND — Tiago Oficial (arquivo 9)
const wbIC = XLSX.readFile(PATH_IMOBCOND);
const icParsed = parseSheet(wbIC, 'Tiago Oficial', 'split');
seed.imob = icParsed.rows.filter((r) => r.tipo === 'imob');
seed.cond = icParsed.rows.filter((r) => r.tipo === 'cond');

seed.meta = {
  ...(seed.meta || {}),
  gruposImportedAt: now,
  grupos: {
    ocup: {
      label: 'Imóveis Ocupados',
      source: path.basename(PATH_OCUP),
      sheet: 'Luma Oficial',
      rows: seed.ocup.length,
      status: countStatus(seed.ocup),
      abertoConvertidos: ocupParsed.abertoConverted,
    },
    ager: {
      label: 'Assistente ADM',
      source: path.basename(PATH_AGER),
      sheet: 'Ana Oficial',
      rows: seed.ager.length,
      status: countStatus(seed.ager),
      abertoConvertidos: agerParsed.abertoConverted,
    },
    imobCond: {
      label: 'Condomínio + Imobiliária',
      source: path.basename(PATH_IMOBCOND),
      sheet: 'Tiago Oficial',
      rows: seed.imob.length + seed.cond.length,
      imobRows: seed.imob.length,
      condRows: seed.cond.length,
      status: countStatus([...seed.imob, ...seed.cond]),
      imobStatus: countStatus(seed.imob),
      condStatus: countStatus(seed.cond),
      abertoConvertidos: icParsed.abertoConverted,
    },
  },
  ocupImportedAt: now,
  ocupSource: path.basename(PATH_OCUP),
  ocupSheet: 'Luma Oficial',
  ocupRows: seed.ocup.length,
  ocupStatus: countStatus(seed.ocup),
  ocupFaithful: true,
  agerImportedAt: now,
  agerSource: path.basename(PATH_AGER),
  agerRows: seed.ager.length,
  agerStatus: countStatus(seed.ager),
  imobCondImportedAt: now,
  imobCondSource: path.basename(PATH_IMOBCOND),
  imobRows: seed.imob.length,
  condRows: seed.cond.length,
  imobStatus: countStatus(seed.imob),
  condStatus: countStatus(seed.cond),
  imobCondStatus: countStatus([...seed.imob, ...seed.cond]),
  abertoComoAndamento: true,
};

fs.writeFileSync(OUT, JSON.stringify(seed), 'utf8');
fs.writeFileSync(OUT_OCUP, JSON.stringify({ ocup: seed.ocup, meta: seed.meta }), 'utf8');
fs.writeFileSync(OUT_AGER, JSON.stringify({ ager: seed.ager, meta: seed.meta }), 'utf8');
fs.writeFileSync(OUT_IMOB, JSON.stringify({ imob: seed.imob, meta: seed.meta }), 'utf8');
fs.writeFileSync(OUT_COND, JSON.stringify({ cond: seed.cond, meta: seed.meta }), 'utf8');

console.log('=== 3 GRUPOS (Aberto → Em andamento) ===\n');
console.log('1) Imóveis Ocupados (Luma)');
console.log('   ', seed.ocup.length, 'linhas', countStatus(seed.ocup), '| Aberto→And:', ocupParsed.abertoConverted);
console.log('2) Assistente ADM (Ana)');
console.log('   ', seed.ager.length, 'linhas', countStatus(seed.ager), '| Aberto→And:', agerParsed.abertoConverted);
console.log('3) Condomínio + Imobiliária (Tiago)');
console.log('   Total', seed.imob.length + seed.cond.length, '→ imob', seed.imob.length, 'cond', seed.cond.length);
console.log('   Combined', countStatus([...seed.imob, ...seed.cond]), '| Aberto→And:', icParsed.abertoConverted);
console.log('   imob', countStatus(seed.imob));
console.log('   cond', countStatus(seed.cond));
console.log('\nWritten seeds OK');
