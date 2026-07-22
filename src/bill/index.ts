// Bill — read-only, unauthenticated joint-budget status site.
// Serves two pages from cached YNAB data: the joint-category overview and a
// per-category current-month transaction list (Revolut Joint account).

import { billConfig } from './config.ts';
import { getCategoryPage, getLandingData, warmCache } from './data.ts';
import {
  REVEAL_SKELETON,
  renderCategory,
  renderError,
  renderErrorBody,
  renderLandingBody,
  renderLandingSkeleton,
  renderNotFound,
  shellFoot,
  shellHead,
} from './render.ts';

// Serve cached HTML for a minute, then let browsers/CDNs use the stale copy
// while they revalidate — mirrors the server's SWR data cache.
const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=60, stale-while-revalidate=300',
};

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: HTML_HEADERS });
}

// Stream the landing page: flush the shell + skeleton immediately for an instant
// first paint, then swap in the real content once the (usually warm) data
// resolves, so a cold YNAB fetch never blocks first paint.
function streamLanding(month: string | undefined): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      push(shellHead("What's left"));
      push(renderLandingSkeleton());
      try {
        const data = await getLandingData(month);
        push(REVEAL_SKELETON + renderLandingBody(data));
      } catch (error) {
        console.error('[bill] landing failed', error);
        push(REVEAL_SKELETON + renderErrorBody());
      }
      push(shellFoot());
      controller.close();
    },
  });
  return new Response(stream, { headers: HTML_HEADERS });
}

const server = Bun.serve({
  port: billConfig.port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'bill' });
    }

    try {
      const month = url.searchParams.get('month') ?? undefined;

      if (url.pathname === '/') {
        return streamLanding(month);
      }

      const match = url.pathname.match(/^\/category\/([^/]+)\/?$/);
      if (match) {
        const page = await getCategoryPage(decodeURIComponent(match[1]), month);
        return page ? html(renderCategory(page)) : html(renderNotFound(), 404);
      }

      return html(renderNotFound(), 404);
    } catch (error) {
      console.error('[bill] request failed', error);
      return html(renderError(), 502);
    }
  },
});

console.log(`bill listening on http://localhost:${server.port}`);

// Keep the current-month caches warm so visitors rarely hit a cold YNAB fetch.
// The SWR cache serves stale data instantly, so these refreshes stay in the
// background; we just trigger them on startup and once per TTL.
function warmNow(): void {
  warmCache().catch((error) => console.error('[bill] cache warm failed', error));
}

warmNow();
setInterval(warmNow, billConfig.cacheTtlMs);
