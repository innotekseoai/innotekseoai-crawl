import { NextRequest } from 'next/server';
import { taskManager } from '@/lib/queue/task-manager';

export const dynamic = 'force-dynamic';

const EVENT_MAP: Record<string, string> = {
  'task:page': 'page',
  'task:log': 'log',
  'task:analysis': 'analysis',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      function replayAndSubscribe() {
        const task = taskManager.get(id);

        // Replay buffered events
        if (task) {
          for (const entry of taskManager.getEventLog(id)) {
            const sseEvent = EVENT_MAP[entry.event];
            if (sseEvent) {
              send(sseEvent, entry.data);
            }
          }

          send('progress', {
            status: task.status,
            progress: task.progress,
            message: task.message,
          });
        }

        // Subscribe to live events
        function onUpdated(t: { id: string; status: string; progress: number; message: string }) {
          if (t.id !== id) return;
          send('progress', { status: t.status, progress: t.progress, message: t.message });
        }

        function onPage(data: { taskId: string; url: string; title?: string; charCount: number; index: number }) {
          if (data.taskId !== id) return;
          send('page', data);
        }

        function onLog(data: { taskId: string; id: string; level: string; message: string }) {
          if (data.taskId !== id) return;
          send('log', data);
        }

        function onAnalysis(data: { taskId: string; url: string; entityClarityScore: number }) {
          if (data.taskId !== id) return;
          send('analysis', data);
        }

        function onCompleted(t: { id: string; result?: unknown }) {
          if (t.id !== id) return;
          send('complete', { id: t.id });
          cleanup();
          closed = true;
          controller.close();
        }

        function onFailed(t: { id: string; error?: string }) {
          if (t.id !== id) return;
          send('error', { error: t.error });
          cleanup();
          closed = true;
          controller.close();
        }

        function cleanup() {
          taskManager.off('task:updated', onUpdated);
          taskManager.off('task:page', onPage);
          taskManager.off('task:log', onLog);
          taskManager.off('task:analysis', onAnalysis);
          taskManager.off('task:completed', onCompleted);
          taskManager.off('task:failed', onFailed);
          taskManager.off('task:created', onCreated);
        }

        // For pending tasks — wait for the task to be created in TaskManager
        function onCreated(t: { id: string }) {
          if (t.id !== id) return;
          // Task just appeared — replay will be empty but we're now subscribed
          send('progress', { status: 'running', progress: 0, message: 'Starting...' });
        }

        taskManager.on('task:updated', onUpdated);
        taskManager.on('task:page', onPage);
        taskManager.on('task:log', onLog);
        taskManager.on('task:analysis', onAnalysis);
        taskManager.on('task:completed', onCompleted);
        taskManager.on('task:failed', onFailed);
        taskManager.on('task:created', onCreated);

        // If task already completed/failed, send final event after delay (for replay flush)
        if (task && (task.status === 'completed' || task.status === 'failed')) {
          setTimeout(() => {
            if (task.status === 'completed') {
              send('complete', { id });
            } else {
              send('error', { error: task.error });
            }
            cleanup();
            closed = true;
            controller.close();
          }, 100);
        }
      }

      // Send an initial connected event so the client knows SSE is ready
      send('connected', { id });
      replayAndSubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
