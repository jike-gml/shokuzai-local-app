import { bulkPutIngredients } from './db.js';

const HEADER_MAP = {
  '食材名': 'name',
  '品名': 'name',
  'メモ': 'memo',
  '状態': 'status',
  '登録日': 'createdAt',
  'カテゴリー': 'category',
  '量': 'amount',
  '期限': 'expiry',
  '購入店': 'store',
  'ID': 'id',
  '買い物リスト': 'shopping'
};

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  text = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  row.push(field.replace(/\r$/, ''));
  if (row.length > 1 || row[0] !== '') rows.push(row);

  return rows;
}

function normalizeBool(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return value === true || ['true', '1', 'yes', 'on'].includes(text);
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const m = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!m) return text;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

function normalizeDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return new Date().toISOString();

  const direct = new Date(text.replace(/\//g, '-'));
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  return new Date().toISOString();
}

export function mapSheetCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    throw new Error('CSVにデータ行がありません。');
  }

  const headers = rows[0].map(v => String(v || '').trim());
  const indexes = {};

  headers.forEach((header, index) => {
    const key = HEADER_MAP[header];
    if (key) indexes[key] = index;
  });

  if (indexes.name === undefined) {
    throw new Error('「食材名」または「品名」列が見つかりません。');
  }

  const items = [];
  const skipped = [];

  rows.slice(1).forEach((row, i) => {
    const value = key => {
      const index = indexes[key];
      return index === undefined ? '' : (row[index] ?? '');
    };

    const name = String(value('name')).trim();
    if (!name) {
      skipped.push(i + 2);
      return;
    }

    const rawId = String(value('id')).trim();

    items.push({
      id: rawId || crypto.randomUUID(),
      name,
      memo: String(value('memo')).trim(),
      status: String(value('status')).trim() || '在庫あり',
      createdAt: normalizeDateTime(value('createdAt')),
      category: String(value('category')).trim() || 'その他',
      amount: String(value('amount')).trim(),
      expiry: normalizeDate(value('expiry')),
      store: String(value('store')).trim(),
      shopping: normalizeBool(value('shopping'))
    });
  });

  return { items, skipped, headers };
}

export async function importSheetCSV(text, mode = 'merge') {
  const parsed = mapSheetCSV(text);
  await bulkPutIngredients(parsed.items, mode === 'replace');
  return parsed;
}
