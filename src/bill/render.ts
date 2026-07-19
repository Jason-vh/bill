// HTML rendering for Bill. Dark "handwritten ledger" design, mobile-first.

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

/** Remaining amount, styled: gold "−€ x" when overspent. */
function remaining(category: CategorySummary): string {
  return category.overspent ? `\u2212${formatEUR(category.left)}` : formatEUR(category.left);
}

const STYLES = `
  :root {
    --page:#12130f; --card:#2b322b; --card-border:rgba(255,255,255,.07);
    --ink:#f1ede2; --muted:#8b9186; --line:rgba(255,255,255,.09);
    --track:rgba(255,255,255,.10); --fill:#ece7db; --gold:#e5bd4f;
    color-scheme:dark;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--page); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    padding:max(env(safe-area-inset-top),16px) 16px max(env(safe-area-inset-bottom),24px);
  }
  .card {
    max-width:560px; margin:0 auto; background:var(--card);
    border:1px solid var(--card-border); border-radius:22px;
    padding:26px 26px 32px; box-shadow:0 12px 44px rgba(0,0,0,.38);
  }
  .script { font-family:"Caveat",cursive; }
  .head { text-align:center; padding:6px 0 2px; }
  .head h1 { font-family:"Caveat",cursive; font-weight:700; font-size:46px; margin:0; letter-spacing:.5px; }
  .head .sub { font-family:"Caveat",cursive; font-size:22px; color:var(--muted); margin-top:0; }
  .rule { border:0; border-top:1px solid var(--line); margin:14px 0 4px; }
  .back {
    display:inline-block; font-size:12px; letter-spacing:.14em; text-transform:uppercase;
    color:var(--muted); text-decoration:none; margin-bottom:6px;
  }
  .back:hover { color:var(--ink); }

  .cat { display:block; text-decoration:none; color:inherit; padding:18px 0; border-top:1px solid var(--line); }
  .cat:first-of-type { border-top:0; }
  .row { display:flex; align-items:baseline; gap:10px; }
  .name { font-family:"Caveat",cursive; font-size:27px; font-weight:700; }
  .lead { flex:1; border-bottom:2px dotted rgba(255,255,255,.20); transform:translateY(-7px); }
  .amt { font-family:"Caveat",cursive; font-size:30px; font-weight:700; white-space:nowrap; }
  .cat.over .amt { color:var(--gold); }
  .bar { margin-top:12px; height:3px; background:var(--track); border-radius:3px; overflow:hidden; }
  .fill { height:100%; background:var(--fill); border-radius:3px; }
  .cat.over .fill { background:var(--gold); }
  .meta { margin-top:7px; text-align:right; font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }

  .txn { display:flex; align-items:baseline; gap:8px; padding:15px 0; border-top:1px solid var(--line); }
  .txn:first-of-type { border-top:0; }
  .who { display:flex; align-items:baseline; gap:8px; min-width:0; }
  .payee { font-family:"Caveat",cursive; font-size:24px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .date { font-size:12.5px; color:var(--muted); white-space:nowrap; }
  .txn .amt { font-size:26px; }
  .empty { text-align:center; color:var(--muted); font-family:"Caveat",cursive; font-size:22px; padding:34px 0 12px; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>${escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap" rel="stylesheet" />
<style>${STYLES}</style>
</head>
<body>
<main class="card">
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
    <span class="lead"></span>
    <span class="amt">${remaining(c)}</span>
  </div>
  <div class="bar"><div class="fill" style="width:${(c.fraction * 100).toFixed(1)}%"></div></div>
  <div class="meta">${formatEUR(c.spent)} / ${formatEUR(c.target)}</div>
</a>`;
    })
    .join('\n');

  const body = `<header class="head">
  <h1>What's left</h1>
  <p class="sub">${escape(data.monthLabel)} \u00b7 ${formatEUR(data.totalLeft)} to go</p>
</header>
<hr class="rule" />
${rows}`;

  return shell("What's left", body);
}

export function renderCategory(page: CategoryPage): string {
  const { category } = page;
  const left = category.overspent ? `\u2212${formatEUR(category.left)}` : formatEUR(category.left);

  const list =
    page.transactions.length === 0
      ? `<p class="empty">No transactions this month.</p>`
      : page.transactions
          .map(
            (t) => `<div class="txn">
  <span class="who"><span class="payee">${escape(t.payee)}</span><span class="date">${escape(shortDate(t.date))}</span></span>
  <span class="lead"></span>
  <span class="amt">${formatEUR(t.amount, { decimals: true })}</span>
</div>`,
          )
          .join('\n');

  const body = `<a class="back" href="/">&lsaquo; All categories</a>
<header class="head">
  <h1>${escape(category.name)}</h1>
  <p class="sub">${left} left of ${formatEUR(category.target)}</p>
</header>
<hr class="rule" />
${list}`;

  return shell(category.name, body);
}

export function renderNotFound(): string {
  return shell('Not found', `<p class="empty">That page doesn't exist.</p><a class="back" href="/">&lsaquo; All categories</a>`);
}

export function renderError(): string {
  return shell('Unavailable', `<p class="empty">Couldn't load the budget right now.<br />Try again in a moment.</p>`);
}
