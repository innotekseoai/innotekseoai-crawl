/**
 * In-process async task runner with EventEmitter
 *
 * Manages crawl + analysis jobs without external queue (no Redis).
 * Buffers log and page events so late SSE subscribers get the full history.
 */

import { EventEmitter } from 'node:events';
import { persistTask } from '@/lib/db/task-store';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskEvent {
  event: string;
  data: unknown;
}

export interface Task<T = unknown> {
  id: string;
  status: TaskStatus;
  progress: number; // 0-100
  message: string;
  result?: T;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  eventLog: TaskEvent[];
}

const MAX_EVENT_LOG = 500;

export class TaskManager extends EventEmitter {
  private tasks = new Map<string, Task>();
  private abortControllers = new Map<string, AbortController>();

  create(id: string): Task {
    const task: Task = {
      id,
      status: 'pending',
      progress: 0,
      message: 'Queued',
      eventLog: [],
    };
    this.tasks.set(id, task);
    const ac = new AbortController();
    this.abortControllers.set(id, ac);
    this.emit('task:created', task);
    return task;
  }

  /** Get the AbortSignal for a task (used by pipeline to check cancellation) */
  getSignal(id: string): AbortSignal | undefined {
    return this.abortControllers.get(id)?.signal;
  }

  /** Cancel a running task */
  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'running') return false;
    const ac = this.abortControllers.get(id);
    if (ac) {
      ac.abort();
      task.status = 'failed';
      task.error = 'Cancelled by user';
      task.message = 'Cancelled';
      task.completedAt = new Date();
      this.persistState(task);
      this.emit('task:failed', task);
      return true;
    }
    return false;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /** Get buffered events for a task (for SSE replay on connect) */
  getEventLog(id: string): TaskEvent[] {
    return this.tasks.get(id)?.eventLog ?? [];
  }

  /** Persist task state to DB (fire-and-forget) */
  private persistState(task: Task) {
    persistTask({
      id: task.id,
      status: task.status,
      progress: task.progress,
      message: task.message,
      error: task.error ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
    }).catch(() => {}); // Don't block on DB errors
  }

  update(id: string, updates: Partial<Pick<Task, 'progress' | 'message' | 'status'>>) {
    const task = this.tasks.get(id);
    if (!task) return;
    Object.assign(task, updates);
    this.emit('task:updated', task);
  }

  /** Override emit to buffer page and log events */
  emit(eventName: string | symbol, ...args: unknown[]): boolean {
    const name = String(eventName);

    // Buffer page, log, and analysis events for replay
    if (name === 'task:page' || name === 'task:log' || name === 'task:analysis') {
      const data = args[0] as { taskId?: string } | undefined;
      if (data?.taskId) {
        const task = this.tasks.get(data.taskId);
        if (task && task.eventLog.length < MAX_EVENT_LOG) {
          task.eventLog.push({ event: name, data });
        }
      }
    }

    return super.emit(eventName, ...args);
  }

  async run<T>(id: string, fn: (update: (progress: number, message: string) => void) => Promise<T>): Promise<T> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    task.status = 'running';
    task.startedAt = new Date();
    this.persistState(task);
    this.emit('task:started', task);

    const update = (progress: number, message: string) => {
      task.progress = progress;
      task.message = message;
      this.emit('task:updated', task);
    };

    try {
      const result = await fn(update);
      task.status = 'completed';
      task.progress = 100;
      task.message = 'Done';
      task.result = result;
      task.completedAt = new Date();
      this.persistState(task);
      this.emit('task:completed', task);
      return result;
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.message = `Failed: ${task.error}`;
      task.completedAt = new Date();
      this.persistState(task);
      this.emit('task:failed', task);
      throw err;
    }
  }
}

export const taskManager = new TaskManager();
