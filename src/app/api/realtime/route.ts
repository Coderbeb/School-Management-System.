import { Pool, PoolClient } from 'pg';
import { NextResponse } from 'next/server';

// SSE endpoint for real-time updates via PostgreSQL LISTEN/NOTIFY
// Each connected client holds its own dedicated PG connection
const MAX_SSE_CONNECTIONS = 30;
let activeConnections = 0;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    // Guard: prevent too many concurrent SSE connections
    if (activeConnections >= MAX_SSE_CONNECTIONS) {
        return NextResponse.json(
            { error: 'Too many real-time connections' },
            { status: 503 }
        );
    }

    // LISTEN/NOTIFY requires a direct connection — PgBouncer (transaction mode) drops them silently
    const directUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

    const isLocalhost =
        directUrl?.includes('localhost') ||
        directUrl?.includes('127.0.0.1');

    // Create a DEDICATED pool for this SSE connection (pool of 1)
    const ssePool = new Pool({
        connectionString: directUrl,
        max: 1,
        ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
    });

    // Use a mutable wrapper to share the client between start() and cancel()
    const state: { client: PoolClient | null; closed: boolean } = {
        client: null,
        closed: false,
    };

    const stream = new ReadableStream({
        async start(controller) {
            activeConnections++;

            try {
                const pgClient = await ssePool.connect();
                state.client = pgClient;

                await pgClient.query('LISTEN table_changes');

                // Send initial heartbeat so the client knows the connection is alive
                controller.enqueue(
                    new TextEncoder().encode(
                        `data: ${JSON.stringify({ type: 'connected', activeConnections })}\n\n`
                    )
                );

                // Listen for NOTIFY events
                pgClient.on('notification', (msg: { payload?: string }) => {
                    if (state.closed) return;
                    try {
                        const payload = msg.payload || '{}';
                        controller.enqueue(
                            new TextEncoder().encode(`data: ${payload}\n\n`)
                        );
                    } catch {
                        // Stream closed, ignore
                    }
                });

                // Keep-alive ping every 30 seconds to prevent connection timeout
                const keepAlive = setInterval(() => {
                    if (state.closed) {
                        clearInterval(keepAlive);
                        return;
                    }
                    try {
                        controller.enqueue(
                            new TextEncoder().encode(`: keep-alive\n\n`)
                        );
                    } catch {
                        clearInterval(keepAlive);
                    }
                }, 30000);

                // Store cleanup interval so cancel() can clear it
                const originalCancel = stream.cancel;
            } catch (err) {
                console.error('[SSE] Connection error:', err);
                activeConnections--;

                if (state.client) {
                    state.client.release();
                    state.client = null;
                }
                ssePool.end().catch(() => {});

                try {
                    controller.enqueue(
                        new TextEncoder().encode(
                            `data: ${JSON.stringify({ type: 'error', message: 'Connection failed' })}\n\n`
                        )
                    );
                    controller.close();
                } catch {
                    // Ignore
                }
            }
        },

        cancel() {
            // Called when client disconnects
            if (state.closed) return;
            state.closed = true;
            activeConnections--;

            if (state.client) {
                state.client.query('UNLISTEN table_changes').catch(() => {});
                state.client.release();
                state.client = null;
            }
            ssePool.end().catch(() => {});
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable Nginx buffering
        },
    });
}
