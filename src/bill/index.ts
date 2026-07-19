// Bill — read-only, unauthenticated joint-budget status site.
// Serves two pages from cached YNAB data: the joint-category overview and a
// per-category current-month transaction list (Revolut Joint account).

import { billConfig } from './config.ts';
import { getCategoryPage, getLandingData } from './data.ts';
import { renderCategory, renderError, renderLanding, renderNotFound } from './render.ts';

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
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
      if (url.pathname === '/') {
        return html(renderLanding(await getLandingData()));
      }

      const match = url.pathname.match(/^\/category\/([^/]+)\/?$/);
      if (match) {
        const page = await getCategoryPage(decodeURIComponent(match[1]));
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
