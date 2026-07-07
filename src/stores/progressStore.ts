import { load } from '@tauri-apps/plugin-store';
import { normalizeProgress, type UserProgress } from '../features/progress/progress-model';

export const PROGRESS_STORE_FILE = 'progress.json';
export const PROGRESS_STORE_KEY = 'user-progress';

export type ProgressStoreAdapter = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
};

export type ProgressStoreLoader = (path: string) => Promise<ProgressStoreAdapter>;

export type ProgressStoreApi = {
  load(today?: string): Promise<UserProgress>;
  save(progress: UserProgress): Promise<UserProgress>;
};

function defaultLoader(path: string): Promise<ProgressStoreAdapter> {
  return load(path, { autoSave: false, defaults: {} }) as Promise<ProgressStoreAdapter>;
}

export function createProgressStore(loader: ProgressStoreLoader = defaultLoader): ProgressStoreApi {
  let storePromise: Promise<ProgressStoreAdapter> | null = null;

  async function getStore() {
    storePromise ??= loader(PROGRESS_STORE_FILE);
    return storePromise;
  }

  return {
    async load(today?: string) {
      const store = await getStore();
      const raw = await store.get<unknown>(PROGRESS_STORE_KEY);
      return normalizeProgress(raw, today);
    },

    async save(progress: UserProgress) {
      const store = await getStore();
      const normalized = normalizeProgress(progress, progress.lastActiveDate);
      await store.set(PROGRESS_STORE_KEY, normalized);
      await store.save();
      return normalized;
    },
  };
}

export const progressStore = createProgressStore();
