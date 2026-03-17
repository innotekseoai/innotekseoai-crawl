import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskManager } from '../../../src/lib/queue/task-manager.js';

describe('TaskManager', () => {
  let tm: TaskManager;

  beforeEach(() => {
    tm = new TaskManager();
  });

  // -----------------------------------------------------------------------
  // create / get
  // -----------------------------------------------------------------------
  describe('create', () => {
    it('creates a task with pending status', () => {
      const task = tm.create('t1');
      expect(task.id).toBe('t1');
      expect(task.status).toBe('pending');
      expect(task.progress).toBe(0);
      expect(task.message).toBe('Queued');
    });

    it('task is retrievable via get', () => {
      tm.create('t1');
      const task = tm.get('t1');
      expect(task).toBeDefined();
      expect(task?.id).toBe('t1');
    });

    it('emits task:created event', () => {
      const handler = vi.fn();
      tm.on('task:created', handler);
      tm.create('t1');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent task', () => {
      expect(tm.get('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  describe('update', () => {
    it('updates progress and message', () => {
      tm.create('t1');
      tm.update('t1', { progress: 50, message: 'Halfway' });
      const task = tm.get('t1');
      expect(task?.progress).toBe(50);
      expect(task?.message).toBe('Halfway');
    });

    it('emits task:updated event', () => {
      tm.create('t1');
      const handler = vi.fn();
      tm.on('task:updated', handler);
      tm.update('t1', { progress: 25, message: 'Working' });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ progress: 25, message: 'Working' })
      );
    });

    it('ignores update for non-existent task', () => {
      // Should not throw
      tm.update('nonexistent', { progress: 50 });
    });

    it('can update status', () => {
      tm.create('t1');
      tm.update('t1', { status: 'running' });
      expect(tm.get('t1')?.status).toBe('running');
    });

    it('partial update preserves other fields', () => {
      tm.create('t1');
      tm.update('t1', { progress: 30 });
      const task = tm.get('t1');
      expect(task?.progress).toBe(30);
      expect(task?.message).toBe('Queued'); // original
    });
  });

  // -----------------------------------------------------------------------
  // run — success
  // -----------------------------------------------------------------------
  describe('run — success', () => {
    it('runs function and returns result', async () => {
      tm.create('t1');
      const result = await tm.run('t1', async () => 42);
      expect(result).toBe(42);
    });

    it('sets status to completed', async () => {
      tm.create('t1');
      await tm.run('t1', async () => 'done');
      const task = tm.get('t1');
      expect(task?.status).toBe('completed');
      expect(task?.progress).toBe(100);
      expect(task?.message).toBe('Done');
    });

    it('sets completedAt', async () => {
      tm.create('t1');
      await tm.run('t1', async () => null);
      expect(tm.get('t1')?.completedAt).toBeInstanceOf(Date);
    });

    it('sets startedAt', async () => {
      tm.create('t1');
      await tm.run('t1', async () => null);
      expect(tm.get('t1')?.startedAt).toBeInstanceOf(Date);
    });

    it('stores result on task', async () => {
      tm.create('t1');
      await tm.run('t1', async () => ({ value: 123 }));
      expect(tm.get('t1')?.result).toEqual({ value: 123 });
    });

    it('emits task:started event', async () => {
      tm.create('t1');
      // Capture status at the moment of the event (object is mutated later)
      const statuses: string[] = [];
      tm.on('task:started', (task) => statuses.push(task.status));
      await tm.run('t1', async () => null);
      expect(statuses).toContain('running');
    });

    it('emits task:completed event', async () => {
      tm.create('t1');
      const statuses: string[] = [];
      tm.on('task:completed', (task) => statuses.push(task.status));
      await tm.run('t1', async () => null);
      expect(statuses).toContain('completed');
    });

    it('update callback emits task:updated events', async () => {
      tm.create('t1');
      const snapshots: Array<{ progress: number; message: string }> = [];
      tm.on('task:updated', (task) => {
        snapshots.push({ progress: task.progress, message: task.message });
      });

      await tm.run('t1', async (update) => {
        update(25, 'Step 1');
        update(50, 'Step 2');
        update(75, 'Step 3');
      });

      expect(snapshots).toHaveLength(3);
      expect(snapshots[0]).toEqual({ progress: 25, message: 'Step 1' });
      expect(snapshots[1]).toEqual({ progress: 50, message: 'Step 2' });
      expect(snapshots[2]).toEqual({ progress: 75, message: 'Step 3' });
    });
  });

  // -----------------------------------------------------------------------
  // run — failure
  // -----------------------------------------------------------------------
  describe('run — failure', () => {
    it('throws the original error', async () => {
      tm.create('t1');
      await expect(
        tm.run('t1', async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    });

    it('sets status to failed', async () => {
      tm.create('t1');
      try {
        await tm.run('t1', async () => {
          throw new Error('boom');
        });
      } catch { /* expected */ }
      const task = tm.get('t1');
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('boom');
    });

    it('sets failure message', async () => {
      tm.create('t1');
      try {
        await tm.run('t1', async () => {
          throw new Error('something went wrong');
        });
      } catch { /* expected */ }
      expect(tm.get('t1')?.message).toContain('something went wrong');
    });

    it('sets completedAt on failure', async () => {
      tm.create('t1');
      try {
        await tm.run('t1', async () => {
          throw new Error('boom');
        });
      } catch { /* expected */ }
      expect(tm.get('t1')?.completedAt).toBeInstanceOf(Date);
    });

    it('emits task:failed event', async () => {
      tm.create('t1');
      const handler = vi.fn();
      tm.on('task:failed', handler);
      try {
        await tm.run('t1', async () => {
          throw new Error('boom');
        });
      } catch { /* expected */ }
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error: 'boom' })
      );
    });

    it('handles non-Error throws', async () => {
      tm.create('t1');
      try {
        await tm.run('t1', async () => {
          throw 'string error';
        });
      } catch { /* expected */ }
      expect(tm.get('t1')?.error).toBe('string error');
    });
  });

  // -----------------------------------------------------------------------
  // run — missing task
  // -----------------------------------------------------------------------
  describe('run — missing task', () => {
    it('throws for non-existent task id', async () => {
      await expect(
        tm.run('nonexistent', async () => null)
      ).rejects.toThrow('Task nonexistent not found');
    });
  });

  // -----------------------------------------------------------------------
  // multiple tasks
  // -----------------------------------------------------------------------
  describe('multiple tasks', () => {
    it('manages multiple tasks independently', async () => {
      tm.create('t1');
      tm.create('t2');

      await tm.run('t1', async () => 'result1');

      expect(tm.get('t1')?.status).toBe('completed');
      expect(tm.get('t2')?.status).toBe('pending');
    });

    it('concurrent tasks', async () => {
      tm.create('t1');
      tm.create('t2');

      const [r1, r2] = await Promise.all([
        tm.run('t1', async () => 'a'),
        tm.run('t2', async () => 'b'),
      ]);

      expect(r1).toBe('a');
      expect(r2).toBe('b');
      expect(tm.get('t1')?.status).toBe('completed');
      expect(tm.get('t2')?.status).toBe('completed');
    });
  });
});
