import { exportDatabase, restoreDatabase, setMeta } from './db.js';

export async function downloadBackup() {
  const payload = await exportDatabase();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shokuzai-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const now = new Date().toISOString();
  await setMeta('lastBackup', now);
  return now;
}

export async function restoreBackupFile(file) {
  const text = await file.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('JSONファイルを読み込めませんでした。');
  }

  await restoreDatabase(payload);
}
