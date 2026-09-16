export const DB_NAME = 'shokuzaiLocalDB';
export const DB_VERSION = 1;

const STORES = {
  ingredients: 'ingredients',
  config: 'config',
  meta: 'meta'
};

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.ingredients)) {
        const store = db.createObjectStore(STORES.ingredients, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('expiry', 'expiry', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('shopping', 'shopping', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDB();
  try {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = await fn(store, tx);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export async function getAllIngredients() {
  return withStore(STORES.ingredients, 'readonly', async store => {
    const rows = await requestToPromise(store.getAll());
    return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  });
}

export async function putIngredient(item) {
  return withStore(STORES.ingredients, 'readwrite', async store => {
    await requestToPromise(store.put(item));
    return item;
  });
}

export async function deleteIngredient(id) {
  return withStore(STORES.ingredients, 'readwrite', async store => {
    await requestToPromise(store.delete(id));
  });
}

export async function clearIngredients() {
  return withStore(STORES.ingredients, 'readwrite', async store => {
    await requestToPromise(store.clear());
  });
}

export async function bulkPutIngredients(items, replace = false) {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.ingredients, 'readwrite');
    const store = tx.objectStore(STORES.ingredients);

    if (replace) {
      await requestToPromise(store.clear());
    }

    for (const item of items) {
      await requestToPromise(store.put(item));
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getConfig(key, fallback) {
  return withStore(STORES.config, 'readonly', async store => {
    const result = await requestToPromise(store.get(key));
    return result ? result.value : fallback;
  });
}

export async function setConfig(key, value) {
  return withStore(STORES.config, 'readwrite', async store => {
    await requestToPromise(store.put({ key, value }));
  });
}

export async function getMeta(key, fallback = null) {
  return withStore(STORES.meta, 'readonly', async store => {
    const result = await requestToPromise(store.get(key));
    return result ? result.value : fallback;
  });
}

export async function setMeta(key, value) {
  return withStore(STORES.meta, 'readwrite', async store => {
    await requestToPromise(store.put({ key, value }));
  });
}

export async function exportDatabase() {
  const [ingredients, categories, stores, lastBackup] = await Promise.all([
    getAllIngredients(),
    getConfig('categories', []),
    getConfig('stores', []),
    getMeta('lastBackup', null)
  ]);

  return {
    format: 'shokuzai-local-backup',
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    ingredients,
    config: { categories, stores },
    meta: { lastBackup }
  };
}

export async function restoreDatabase(payload) {
  if (!payload || payload.format !== 'shokuzai-local-backup' || !Array.isArray(payload.ingredients)) {
    throw new Error('このJSONファイルは食材管理アプリのバックアップ形式ではありません。');
  }

  await bulkPutIngredients(payload.ingredients, true);

  if (payload.config?.categories) {
    await setConfig('categories', payload.config.categories);
  }

  if (payload.config?.stores) {
    await setConfig('stores', payload.config.stores);
  }
}
