/**
 * DB-backed task state persistence
 *
 * Stores task status transitions in SQLite so tasks survive process restarts.
 * The in-memory TaskManager remains the source of truth for live tasks;
 * this layer persists state for crash recovery.
 */

import { getDb, saveDb } from './client.js';
import { tasks } from './schema.js';
import { eq } from 'drizzle-orm';

export interface PersistedTask {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export async function persistTask(task: PersistedTask): Promise<void> {
  const db = await getDb();
  const existing = await db.select().from(tasks).where(eq(tasks.id, task.id));

  if (existing.length > 0) {
    await db.update(tasks)
      .set({
        status: task.status,
        progress: task.progress,
        message: task.message,
        error: task.error,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tasks.id, task.id));
  } else {
    await db.insert(tasks).values({
      id: task.id,
      status: task.status,
      progress: task.progress,
      message: task.message,
      error: task.error,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  saveDb();
}

export async function loadPersistedTasks(): Promise<PersistedTask[]> {
  const db = await getDb();
  const rows = await db.select().from(tasks);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    progress: r.progress ?? 0,
    message: r.message ?? '',
    error: r.error,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  }));
}

export async function getPersistedTask(id: string): Promise<PersistedTask | null> {
  const db = await getDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    progress: row.progress ?? 0,
    message: row.message ?? '',
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}
