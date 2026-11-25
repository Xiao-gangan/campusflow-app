const DB_NAME = "campusflow.designer.assets.v1";
const STORE_NAME = "images";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
  return databasePromise;
}

function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("indexeddb_request_failed"));
      }),
  );
}

export async function saveImageBlob(id: string, blob: Blob): Promise<void> {
  await runRequest("readwrite", (store) => store.put(blob, id));
}

export async function loadImageBlob(id: string): Promise<Blob | null> {
  const result = await runRequest<Blob | undefined>("readonly", (store) =>
    store.get(id),
  );
  return result ?? null;
}

export async function deleteImageBlob(id: string): Promise<void> {
  await runRequest("readwrite", (store) => store.delete(id));
}
