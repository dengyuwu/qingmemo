import { describe, expect, it, vi } from 'vitest';
import { createDefaultProgress } from '../features/progress/progress-model';
import { createProgressStore, PROGRESS_STORE_FILE, PROGRESS_STORE_KEY, type ProgressStoreAdapter } from './progressStore';

function memoryAdapter(initial?: unknown): { adapter: ProgressStoreAdapter; state: Map<string, unknown>; save: ReturnType<typeof vi.fn> } {
  const state = new Map<string, unknown>();
  if (initial !== undefined) state.set(PROGRESS_STORE_KEY, initial);
  const save = vi.fn(async () => undefined);
  return {
    state,
    save,
    adapter: {
      async get<T>(key: string) {
        return state.get(key) as T | undefined;
      },
      async set(key: string, value: unknown) {
        state.set(key, value);
      },
      save,
    },
  };
}

describe('progressStore', () => {
  it('loads progress.json through the provided adapter loader', async () => {
    const memory = memoryAdapter({ xp: 210, achievements: ['first_victory'] });
    const load = vi.fn(async (path: string) => {
      expect(path).toBe(PROGRESS_STORE_FILE);
      return memory.adapter;
    });
    const store = createProgressStore(load);

    const progress = await store.load('2026-07-07');

    expect(progress.level).toBe(3);
    expect(progress.achievements).toEqual(['first_victory']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('saves normalized progress under the stable key and flushes to disk', async () => {
    const memory = memoryAdapter();
    const store = createProgressStore(async () => memory.adapter);
    const progress = createDefaultProgress('2026-07-07');

    await store.save({ ...progress, xp: 125 });

    expect(memory.state.get(PROGRESS_STORE_KEY)).toMatchObject({ xp: 125, level: 2 });
    expect(memory.save).toHaveBeenCalledTimes(1);
  });
});
