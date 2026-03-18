/**
 * API auth wrapper — calls authenticateRequest() and returns 401 on failure.
 * Also logs requests when request-logger is available.
 *
 * Usage: export const GET = withAuth(async (request) => { ... });
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from './api-key';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context: any) => Promise<NextResponse | Response>;

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const start = Date.now();
    const method = request.method;
    const path = request.nextUrl.pathname;

    const authenticated = await authenticateRequest(request);
    if (!authenticated) {
      logRequest(method, path, 401, Date.now() - start, request);
      return NextResponse.json(
        { error: 'Unauthorized — provide a valid Bearer token' },
        { status: 401 }
      );
    }

    try {
      const response = await handler(request, context);
      const status = response instanceof NextResponse ? response.status : 200;
      logRequest(method, path, status, Date.now() - start, request);
      return response;
    } catch (err) {
      logRequest(method, path, 500, Date.now() - start, request);
      throw err;
    }
  };
}

function logRequest(method: string, path: string, status: number, durationMs: number, request: NextRequest) {
  const entry = {
    method,
    path,
    status,
    durationMs,
    userAgent: request.headers.get('user-agent') ?? undefined,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(entry));
}
