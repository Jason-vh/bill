// HTML rendering for Bill. Light, iOS-style design on a soft gradient, mobile-first.

import { formatEUR } from './money.ts';
import { shortDate } from './dates.ts';
import type { CategoryPage, CategorySummary, LandingData } from './data.ts';

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
  :root {
    --ink:#1c1c1e; --muted:#8a8a8e; --line:rgba(60,60,67,.12);
    --track:rgba(120,120,128,.22); --blue:#0a84ff; --link:#007aff; --red:#ff3b30;
    --card:rgba(255,255,255,.55); --card-border:rgba(255,255,255,.6);
    color-scheme:light;
  }
  * { box-sizing:border-box; }
  html, body { min-height:100%; }
  body {
    margin:0; color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    background:
      radial-gradient(120% 85% at 0% 0%, #f7d3a4 0%, rgba(247,211,164,0) 46%),
      radial-gradient(120% 90% at 100% 0%, #b6cbf1 0%, rgba(182,203,241,0) 52%),
      radial-gradient(130% 100% at 50% 100%, #f2c3df 0%, rgba(242,195,223,0) 58%),
      #e9e6ef;
    background-attachment:fixed;
    padding:max(env(safe-area-inset-top),20px) 16px max(env(safe-area-inset-bottom),28px);
  }
  .wrap { max-width:420px; margin:0 auto; }

  .head { padding:6px 8px 20px; }
  .month { font-size:15px; font-weight:600; color:var(--muted); margin:0 0 6px; }
  .hero { display:flex; align-items:baseline; gap:12px; }
  .hero .big { font-size:64px; font-weight:800; letter-spacing:-.02em; line-height:1; color:#000; }
  .hero .unit { font-size:24px; font-weight:600; color:var(--muted); }

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
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#e9e6ef" />
<title>${escape(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="wrap">
${body}
</main>
</body>
</html>`;
}

export function renderLanding(data: LandingData): string {
  const rows = data.categories
    .map((c) => {
      const over = c.overspent ? ' over' : '';
      return `<a class="cat${over}" href="/category/${encodeURIComponent(c.id)}">
  <div class="row">
    <span class="name">${escape(c.name)}</span>
    <span class="amt">${statusAmount(c)}</span>
  </div>
  <div class="bar"><div class="fill" style="width:${(c.fraction * 100).toFixed(1)}%"></div></div>
  <div class="meta">${formatEUR(c.spent)} of ${formatEUR(c.target)}</div>
</a>`;
    })
    .join('\n');

  const body = `<header class="head">
  <p class="month">${escape(data.monthLabel)}</p>
  <div class="hero"><span class="big">${formatEUR(data.totalLeft)}</span><span class="unit">left</span></div>
</header>
<section class="card">
${rows}
</section>`;

  return shell("What's left", body);
}

export function renderCategory(page: CategoryPage): string {
  const { category } = page;
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

  const body = `<a class="back" href="/">&lsaquo; Budget</a>
<header class="title">
  <h1>${escape(category.name)}</h1>
  <p class="sub">${status} \u00b7 ${formatEUR(category.spent)} of ${formatEUR(category.target)}</p>
</header>
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

export function renderError(): string {
  return shell(
    'Unavailable',
    `<section class="card"><p class="empty">Couldn't load the budget right now.<br />Try again in a moment.</p></section>`,
  );
}
