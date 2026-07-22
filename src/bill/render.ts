// HTML rendering for Bill. Light, iOS-style design on a soft gradient, mobile-first.

import { formatEUR } from './money.ts';
import { shortDate } from './dates.ts';
import type { CategoryPage, CategorySummary, LandingData, MonthNav } from './data.ts';

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Right-aligned status for a category: "€56 over" when overspent, else what's left. */
function statusAmount(category: CategorySummary): string {
  return category.overspent
    ? `${formatEUR(category.left)} over`
    : formatEUR(category.left);
}

const STYLES = `
  @view-transition { navigation: auto; }
  :root {
    --ink:#1c1c1e; --muted:#8a8a8e; --line:rgba(60,60,67,.12);
    --track:rgba(120,120,128,.22); --blue:#0a84ff; --link:#007aff; --red:#ff3b30;
    --card:rgba(255,255,255,.55); --card-border:rgba(255,255,255,.6);
    color-scheme:light;
  }
  * { box-sizing:border-box; }
  html { background:#e9e6ef; }
  html, body { min-height:100%; }
  body {
    margin:0; color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    padding:max(env(safe-area-inset-top),20px) 16px max(env(safe-area-inset-bottom),28px);
  }
  /* Viewport-locked wash. Both the top and bottom edges are left at the base
     colour so they match the solid fills iOS paints behind the status bar and
     home indicator (iOS uses the page background-COLOUR there, never a
     background image). Colour blooms in from the sides and the middle instead
     of the very edges, so there's no seam at either safe area. */
  body::before {
    content:""; position:fixed; inset:0; z-index:-1;
    background:
      radial-gradient(80% 70% at -10% 50%, #f7d3a4 0%, rgba(247,211,164,0) 55%),
      radial-gradient(80% 70% at 110% 46%, #b6cbf1 0%, rgba(182,203,241,0) 55%),
      radial-gradient(115% 50% at 50% 68%, #f2c3df 0%, rgba(242,195,223,0) 60%),
      #e9e6ef;
  }
  .wrap { max-width:420px; margin:0 auto; }

  .head { padding:6px 8px 14px; }
  .monthnav {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:2px 2px 12px;
  }
  .monthnav .label { font-size:15px; font-weight:600; color:var(--muted); }
  .nav-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:34px; height:34px; border-radius:50%; flex:none;
    font-size:22px; line-height:1; text-decoration:none; color:var(--link);
    background:var(--card); border:1px solid var(--card-border);
    -webkit-backdrop-filter:blur(24px) saturate(140%); backdrop-filter:blur(24px) saturate(140%);
  }
  .nav-btn:hover { opacity:.75; }
  .nav-btn.disabled { color:var(--muted); opacity:.3; pointer-events:none; }
  .section {
    display:flex; align-items:baseline; justify-content:space-between; gap:12px;
    margin:22px 8px 10px; font-size:13px; font-weight:600; letter-spacing:.06em;
    text-transform:uppercase; color:var(--muted);
  }
  .section:first-of-type { margin-top:8px; }
  .section .sub { text-transform:none; letter-spacing:0; font-variant-numeric:tabular-nums; }
  .month { font-size:15px; font-weight:600; color:var(--muted); margin:0 0 6px; }
  .hero { display:flex; align-items:baseline; gap:12px; }
  .hero .big { font-size:64px; font-weight:800; letter-spacing:-.02em; line-height:1; color:#000; }
  .hero .unit { font-size:24px; font-weight:600; color:var(--muted); }
  .account { margin:10px 2px 0; font-size:15px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .account b { font-weight:600; color:var(--ink); }

  .card {
    background:var(--card); border:1px solid var(--card-border); border-radius:24px;
    box-shadow:0 18px 50px rgba(60,50,90,.14); backdrop-filter:blur(24px) saturate(140%);
    -webkit-backdrop-filter:blur(24px) saturate(140%); overflow:hidden;
  }

  .cat { display:block; text-decoration:none; color:inherit; padding:18px 22px; border-top:1px solid var(--line); }
  .cat:first-of-type { border-top:0; }
  .cat .row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .cat .name { font-size:22px; font-weight:600; }
  .cat .amt { font-size:22px; font-weight:700; white-space:nowrap; }
  .cat.over .amt { color:var(--red); }
  .bar { margin-top:12px; height:6px; background:var(--track); border-radius:99px; overflow:hidden; }
  .fill { height:100%; background:var(--blue); border-radius:99px; }
  .cat.over .fill { background:var(--red); }
  .meta { margin-top:9px; font-size:15px; color:var(--muted); font-variant-numeric:tabular-nums; }

  .back {
    display:inline-block; font-size:17px; font-weight:600; color:var(--link);
    text-decoration:none; margin:0 8px 10px;
  }
  .back:hover { opacity:.75; }
  .title { padding:0 8px 20px; }
  .title h1 { font-size:40px; font-weight:800; letter-spacing:-.02em; margin:0 0 6px; color:#000; }
  .title .sub { font-size:17px; color:var(--muted); margin:0; font-variant-numeric:tabular-nums; }

  .txn {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:15px 22px; border-top:1px solid var(--line);
  }
  .txn:first-of-type { border-top:0; }
  .who { min-width:0; }
  .payee { font-size:19px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .date { font-size:14px; color:var(--muted); margin-top:2px; }
  .txn .amt { font-size:19px; font-weight:700; white-space:nowrap; }
  .empty { text-align:center; color:var(--muted); font-size:17px; padding:40px 20px; }

  @keyframes sk-shimmer { to { background-position:-200% 0; } }
  .sk {
    background:linear-gradient(90deg, rgba(255,255,255,.25) 25%, rgba(255,255,255,.6) 37%, rgba(255,255,255,.25) 63%);
    background-size:200% 100%; animation:sk-shimmer 1.4s ease-in-out infinite; border-radius:10px;
  }
  .sk-label { display:inline-block; width:120px; height:15px; }
  .sk-hero { display:inline-block; width:62%; height:52px; border-radius:14px; }
  .sk-row { height:22px; margin:18px 22px; }
`;

// Native prefetch/prerender hints: prerender the adjacent-month arrows on hover
// (instant paging) and prefetch category rows + the back link. Ignored by
// browsers without Speculation Rules support.
const SPECULATION_RULES = `<script type="speculationrules">${JSON.stringify({
  prerender: [{ source: 'document', where: { selector_matches: '.nav-btn' }, eagerness: 'moderate' }],
  prefetch: [{ source: 'document', where: { selector_matches: '.cat, .back' }, eagerness: 'moderate' }],
})}</script>`;

/** Document open through the opening <main>. Flushed first when streaming. */
export function shellHead(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>${escape(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="wrap">
`;
}

/** Closing markup plus prefetch/prerender hints. Flushed last when streaming. */
export function shellFoot(): string {
  return `
</main>
${SPECULATION_RULES}
</body>
</html>`;
}

function shell(title: string, body: string): string {
  return shellHead(title) + body + shellFoot();
}

/** Prev/label/next month pager. `baseHref` is the page URL the arrows link to. */
function renderMonthNav(baseHref: string, nav: MonthNav): string {
  const arrow = (key: string | null, glyph: string, label: string) =>
    key
      ? `<a class="nav-btn" href="${baseHref}?month=${key}" aria-label="${label}">${glyph}</a>`
      : `<span class="nav-btn disabled" aria-hidden="true">${glyph}</span>`;
  return `<nav class="monthnav">${arrow(nav.prev, '‹', 'Previous month')}<span class="label">${escape(nav.label)}</span>${arrow(nav.next, '›', 'Next month')}</nav>`;
}

function renderCatRow(c: CategorySummary, month: string): string {
  const over = c.overspent ? ' over' : '';
  return `<a class="cat${over}" href="/category/${encodeURIComponent(c.id)}?month=${month}">
  <div class="row">
    <span class="name">${escape(c.name)}</span>
    <span class="amt">${statusAmount(c)}</span>
  </div>
  <div class="bar"><div class="fill" style="width:${(c.fraction * 100).toFixed(1)}%"></div></div>
  <div class="meta">${formatEUR(c.spent)} of ${formatEUR(c.target)}</div>
</a>`;
}

export function renderLandingBody(data: LandingData): string {
  const month = data.nav.key;
  const sections = data.groups
    .map(
      (group) => `<h2 class="section"><span>${escape(group.name)}</span><span class="sub">${formatEUR(group.totalLeft)} left</span></h2>
<section class="card">
${group.categories.map((c) => renderCatRow(c, month)).join('\n')}
</section>`,
    )
    .join('\n');

  const account = data.account
    ? `<p class="account"><b>${formatEUR(data.account.balance, { decimals: true, sign: true })}</b> in ${escape(data.account.name)}</p>`
    : '';

  return `<header class="head">
  ${renderMonthNav('/', data.nav)}
  <div class="hero"><span class="big">${formatEUR(data.totalLeft)}</span><span class="unit">left</span></div>
  ${account}
</header>
${sections}`;
}

export function renderLanding(data: LandingData): string {
  return shell("What's left", renderLandingBody(data));
}

/** Placeholder streamed instantly while the landing data loads. */
export function renderLandingSkeleton(): string {
  const rows = Array.from({ length: 4 }, () => '<div class="sk sk-row"></div>').join('\n');
  return `<div id="bill-skeleton" aria-hidden="true">
<header class="head">
  <nav class="monthnav"><span class="nav-btn disabled" aria-hidden="true">\u2039</span><span class="sk sk-label"></span><span class="nav-btn disabled" aria-hidden="true">\u203a</span></nav>
  <div class="hero"><span class="sk sk-hero"></span></div>
</header>
<section class="card">
${rows}
</section>
</div>`;
}

/** Hides the streamed skeleton once the real content follows it. */
export const REVEAL_SKELETON = '<style>#bill-skeleton{display:none}</style>';

export function renderCategory(page: CategoryPage): string {
  const { category, nav } = page;
  const status = category.overspent
    ? `${formatEUR(category.left)} over`
    : `${formatEUR(category.left)} left`;

  const list =
    page.transactions.length === 0
      ? `<p class="empty">No transactions this month.</p>`
      : page.transactions
          .map(
            (t) => `<div class="txn">
  <div class="who">
    <div class="payee">${escape(t.payee)}</div>
    <div class="date">${escape(shortDate(t.date))}</div>
  </div>
  <span class="amt">${formatEUR(t.amount, { decimals: true })}</span>
</div>`,
          )
          .join('\n');

  const categoryHref = `/category/${encodeURIComponent(category.id)}`;
  const body = `<a class="back" href="/?month=${nav.key}">&lsaquo; Budget</a>
<header class="title">
  <h1>${escape(category.name)}</h1>
  <p class="sub">${status} \u00b7 ${formatEUR(category.spent)} of ${formatEUR(category.target)}</p>
</header>
${renderMonthNav(categoryHref, nav)}
<section class="card">
${list}
</section>`;

  return shell(category.name, body);
}

export function renderNotFound(): string {
  return shell(
    'Not found',
    `<a class="back" href="/">&lsaquo; Budget</a>
<section class="card"><p class="empty">That page doesn't exist.</p></section>`,
  );
}

export function renderErrorBody(): string {
  return `<section class="card"><p class="empty">Couldn't load the budget right now.<br />Try again in a moment.</p></section>`;
}

export function renderError(): string {
  return shell('Unavailable', renderErrorBody());
}
