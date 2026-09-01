#!/usr/bin/env node
/**
 * Builds the public GitHub Pages site: a browsable, RTL-Hebrew directory of every
 * listed site, grouped by tier, each with its live-verification evidence and (where we
 * have one) a Shabbat screenshot.
 *
 * Reads `data/sites.json` (the single source of truth) and the proof screenshots in
 * `public/proof/`, and emits a self-contained static site into the output directory
 * (default `site/`, overridable as argv[2]). The GitHub Actions Pages workflow builds
 * this on every push to main and deploys it, so the page always reflects main's data —
 * nothing generated is committed.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, process.argv[2] || 'site')
const REPO_URL = 'https://github.com/benjamingr/shabbat-open-extension'

const data = JSON.parse(readFileSync(join(ROOT, 'data', 'sites.json'), 'utf8'))

/** Tier display metadata — order, Hebrew label, one-line Hebrew description, accent color. */
const TIERS = {
  site_blocked: {
    order: 0,
    label: 'סגור בשבת',
    desc: 'מנגנון חסימה אמיתי חוסם גלישה או רכישה בשבת (עמוד סגירה, תוסף שומר-שבת, או הגדרת זמני שבת בקוד האתר).',
    color: '#dc2626',
  },
  purchase_blocked: {
    order: 1,
    label: 'רכישה חסומה בשבת',
    desc: 'האתר פתוח לגלישה אך לא ניתן לרכוש או לתרום בשבת — חסימה בעגלה/בקופה או תקנון מפורש.',
    color: '#ea580c',
  },
  operations_paused: {
    order: 2,
    label: 'פעילות מושהית בשבת',
    desc: 'האתר מצהיר שהזמנות, משלוחים או פעולות עובדים נעצרים בשבת (הגלישה עשויה להישאר פתוחה).',
    color: '#ca8a04',
  },
  declared_shabbat_observant: {
    order: 3,
    label: 'מצהיר על שמירת שבת',
    desc: 'האתר מציג הצהרת «אתר שומר שבת» משלו, אך לא נצפתה חסימה טכנית.',
    color: '#16a34a',
  },
}

const CONFIDENCE = {
  verified: 'אומת חי — נצפה מנגנון סגירה בפועל',
  high: 'ודאות גבוהה — הצהרה/מנגנון בקוד העמוד',
  medium: 'ודאות בינונית — עדות חלקית',
}

// ---- helpers ----------------------------------------------------------------
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const sortKey = (s) => `${TIERS[s.status]?.order ?? 9}`

// ---- prepare output ---------------------------------------------------------
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Copy proof screenshots that are actually referenced.
const proofSrc = join(ROOT, 'public', 'proof')
const proofOut = join(OUT, 'proof')
let copied = 0
if (existsSync(proofSrc)) {
  mkdirSync(proofOut, { recursive: true })
  const available = new Set(readdirSync(proofSrc))
  for (const s of data.sites) {
    if (s.proof_image && available.has(s.proof_image)) {
      copyFileSync(join(proofSrc, s.proof_image), join(proofOut, s.proof_image))
      copied++
    }
  }
}

// ---- build cards ------------------------------------------------------------
const sites = [...data.sites].sort(
  (a, b) => sortKey(a).localeCompare(sortKey(b)) || String(a.name).localeCompare(String(b.name), 'he'),
)

const counts = {}
for (const s of sites) counts[s.status] = (counts[s.status] || 0) + 1

function card(s) {
  const tier = TIERS[s.status] || { label: s.status, color: '#64748b' }
  const url = `https://${s.domain.replace(/^https?:\/\//, '')}`
  const shot = s.proof_image
    ? `<button class="shot" data-full="proof/${esc(s.proof_image)}" data-name="${esc(s.name)}" aria-label="הצג צילום מסך של ${esc(s.name)}">
         <img loading="lazy" src="proof/${esc(s.proof_image)}" alt="צילום מסך: ${esc(s.name)} בשבת" />
         <span class="shot-zoom" aria-hidden="true">🔍 להגדלה</span>
       </button>`
    : `<div class="shot shot--none" aria-hidden="true"><span>אין צילום מסך</span></div>`

  const holidays = s.holidays ? `<span class="chip chip--holiday">גם בחגים</span>` : ''
  const conf = CONFIDENCE[s.confidence] || s.confidence

  return `<article class="site" data-status="${esc(s.status)}" data-search="${esc(
    `${s.name} ${s.domain} ${s.category}`.toLowerCase(),
  )}">
    ${shot}
    <div class="site-body">
      <div class="site-head">
        <span class="tier-dot" style="--dot:${tier.color}"></span>
        <h3 class="site-name">${esc(s.name)}</h3>
      </div>
      <a class="site-domain" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(
        s.domain,
      )}</a>
      <div class="chips">
        <span class="chip" style="--c:${tier.color}">${esc(tier.label)}</span>
        ${holidays}
      </div>
      ${s.evidence_text ? `<p class="evidence">“${esc(s.evidence_text)}”</p>` : ''}
      <p class="meta"><span title="${esc(conf)}">${esc(
        s.confidence === 'verified' ? '✔︎ אומת חי' : s.confidence === 'high' ? '● ודאות גבוהה' : '○ ודאות בינונית',
      )}</span>${s.verified ? ` · אומת ${esc(s.verified)}` : ''}</p>
    </div>
  </article>`
}

const legend = Object.values(TIERS)
  .sort((a, b) => a.order - b.order)
  .map(
    (t) => `<div class="legend-item">
      <span class="tier-dot" style="--dot:${t.color}"></span>
      <div><strong>${esc(t.label)}</strong><span>${esc(t.desc)}</span></div>
    </div>`,
  )
  .join('\n')

const statBoxes = Object.entries(TIERS)
  .sort((a, b) => a[1].order - b[1].order)
  .map(
    ([k, t]) =>
      `<button class="stat" data-filter="${k}" style="--c:${t.color}"><b>${counts[k] || 0}</b><span>${esc(
        t.label,
      )}</span></button>`,
  )
  .join('\n')

const cardsHtml = sites.map(card).join('\n')
const lastUpdate = data.audited_at || data.generated_at || ''

// ---- store listings --------------------------------------------------------
/*
 * Two published items running the same code over the same list, differing only in host
 * scope. The install page exists because that choice cannot be made from the store
 * listings alone: they look near-identical, and the one thing separating them is a
 * permission whose consequence takes a sentence to explain.
 */
const STORE_REGULAR =
  'https://chromewebstore.google.com/detail/%D7%A1%D7%92%D7%95%D7%A8-%D7%91%D7%A9%D7%91%D7%AA-%E2%80%94-closed-on-sha/afhmkajnjeedoehomajhlnbedpjelfcl'
const STORE_LIVE =
  'https://chromewebstore.google.com/detail/%D7%A1%D7%92%D7%95%D7%A8-%D7%91%D7%A9%D7%91%D7%AA-%D7%A8%D7%A9%D7%99%D7%9E%D7%94-%D7%9E%D7%AA%D7%A2%D7%93%D7%9B%D7%A0%D7%AA-%E2%80%94/pdlnkkoecbhhndephflfbfemcahnpcjo'

// ---- css -------------------------------------------------------------------
/*
 * BASE_CSS is the tokens plus the chrome both pages share (hero, CTA row, footer);
 * DIRECTORY_CSS is everything only the listing page uses. Split rather than duplicated so
 * the install page cannot drift visually from the directory.
 */
const BASE_CSS = `
:root{
  color-scheme:light dark;
  --bg:#f6f7f9; --panel:#ffffff; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0;
  --accent:#7c3aed; --shadow:0 1px 3px rgba(15,23,42,.08),0 8px 24px rgba(15,23,42,.05);
}
@media (prefers-color-scheme:dark){
  :root{--bg:#0b1120;--panel:#131c2e;--ink:#e8edf5;--muted:#94a3b8;--line:#243247;
        --shadow:0 1px 3px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35);}
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Assistant","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  line-height:1.55;-webkit-font-smoothing:antialiased;}
a{color:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}

header.hero{padding:56px 0 28px;text-align:center;background:
  radial-gradient(1200px 380px at 50% -140px, color-mix(in srgb, var(--accent) 20%, transparent), transparent);}
.badge{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:.82rem;
  background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:6px 14px;color:var(--muted);}
h1{font-size:clamp(1.9rem,4.4vw,3rem);margin:18px 0 8px;letter-spacing:-.5px}
.hero p.lead{max-width:640px;margin:0 auto;color:var(--muted);font-size:1.08rem}
.cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px}
.cta a{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;
  text-decoration:none;font-weight:700;border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow)}
.cta a.primary{background:var(--accent);color:#fff;border-color:transparent}
footer{border-top:1px solid var(--line);margin-top:40px;padding:28px 0 60px;color:var(--muted);font-size:.88rem}
footer a{color:var(--accent);text-decoration:none}
footer .note{max-width:760px;margin:0 auto 14px;text-align:center;line-height:1.7}
@media (max-width:520px){header.hero{padding:38px 0 20px}}
`

const DIRECTORY_CSS = `
.stats{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:30px 0 6px}
.stat{cursor:pointer;font:inherit;border:1px solid var(--line);background:var(--panel);border-radius:14px;
  padding:12px 18px;min-width:120px;display:flex;flex-direction:column;align-items:center;gap:2px;
  box-shadow:var(--shadow);border-top:3px solid var(--c);transition:transform .12s ease}
.stat:hover{transform:translateY(-2px)}
.stat.active{outline:2px solid var(--c);outline-offset:1px}
.stat b{font-size:1.7rem;line-height:1}
.stat span{font-size:.82rem;color:var(--muted);font-weight:600}

.legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin:28px 0}
.legend-item{display:flex;gap:10px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:14px 16px}
.legend-item strong{display:block;font-size:.98rem}
.legend-item span{display:block;color:var(--muted);font-size:.86rem;margin-top:2px}
.tier-dot{width:12px;height:12px;border-radius:50%;background:var(--dot);flex:0 0 auto;margin-top:5px;
  box-shadow:0 0 0 4px color-mix(in srgb,var(--dot) 18%,transparent)}

.toolbar{position:sticky;top:0;z-index:5;padding:14px 0;background:
  color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(8px);
  display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.search{flex:1;min-width:220px;position:relative}
.search input{width:100%;padding:12px 42px 12px 14px;border-radius:12px;border:1px solid var(--line);
  background:var(--panel);color:var(--ink);font:inherit}
.search::before{content:"🔍";position:absolute;inset-inline-start:14px;top:50%;transform:translateY(-50%);opacity:.6}
.count-live{color:var(--muted);font-size:.9rem;font-weight:600;white-space:nowrap}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin:24px 0 10px}
.site{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;
  box-shadow:var(--shadow);display:flex;flex-direction:column}
.shot{border:0;padding:0;margin:0;background:#0b1120;cursor:zoom-in;position:relative;display:block;
  width:100%;aspect-ratio:16/10;overflow:hidden}
.shot img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.shot-zoom{position:absolute;inset-block-end:8px;inset-inline-end:8px;background:rgba(0,0,0,.65);color:#fff;
  font-size:.72rem;font-weight:700;padding:4px 8px;border-radius:8px;opacity:0;transition:opacity .15s}
.shot:hover .shot-zoom{opacity:1}
.shot--none{cursor:default;aspect-ratio:16/6;display:flex;align-items:center;justify-content:center;
  background:repeating-linear-gradient(45deg,var(--line),var(--line) 10px,transparent 10px,transparent 20px)}
.shot--none span{background:var(--panel);color:var(--muted);font-size:.78rem;padding:4px 10px;border-radius:8px}
.site-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:7px;flex:1}
.site-head{display:flex;align-items:center;gap:8px}
.site-name{margin:0;font-size:1.08rem}
.site-domain{color:var(--accent);text-decoration:none;font-size:.9rem;font-weight:600;word-break:break-all;direction:ltr;text-align:right}
.site-domain:hover{text-decoration:underline}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.chip{font-size:.76rem;font-weight:700;padding:3px 9px;border-radius:999px;
  color:var(--c,#334155);background:color-mix(in srgb,var(--c,#94a3b8) 14%,transparent);
  border:1px solid color-mix(in srgb,var(--c,#94a3b8) 30%,transparent)}
.chip--holiday{--c:#0891b2}
.evidence{margin:2px 0 0;font-size:.9rem;color:var(--ink);opacity:.9;
  border-inline-start:3px solid var(--line);padding-inline-start:10px}
.meta{margin:auto 0 0;font-size:.8rem;color:var(--muted);padding-top:6px}

.empty{display:none;text-align:center;color:var(--muted);padding:50px 0;font-size:1.05rem}
/* lightbox */
.lb{position:fixed;inset:0;background:rgba(2,6,23,.86);display:none;align-items:center;justify-content:center;
  z-index:50;padding:24px}
.lb.open{display:flex}
.lb figure{margin:0;max-width:min(1100px,96vw);max-height:92vh;display:flex;flex-direction:column;gap:10px}
.lb img{max-width:100%;max-height:82vh;object-fit:contain;border-radius:12px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.lb figcaption{color:#e8edf5;text-align:center;font-weight:700}
.lb .close{position:fixed;top:18px;inset-inline-end:22px;background:rgba(255,255,255,.12);color:#fff;border:0;
  font-size:1.6rem;width:44px;height:44px;border-radius:50%;cursor:pointer}
`

const INSTALL_CSS = `
.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin:34px 0 10px}
.opt{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px 22px;
  box-shadow:var(--shadow);display:flex;flex-direction:column;gap:13px;position:relative}
.opt h2{margin:0;font-size:1.22rem;line-height:1.3}
.opt .scope{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:11px 14px;border-radius:12px;
  background:color-mix(in srgb,var(--ink) 4%,transparent);border:1px solid var(--line)}
.opt .scope b{font-size:.79rem;color:var(--muted);font-weight:700;white-space:nowrap}
.opt .scope span{font-weight:700}

/* Pros and cons carry their own ✓/✗ marker, so neither list needs a heading colour or a
   position on the card to say which it is. */
.opt .col h3{margin:0 0 7px;font-size:.8rem;font-weight:800;color:var(--muted)}
.opt .col ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:.93rem}
.opt .col li{display:flex;gap:8px;align-items:flex-start}
.opt .col li::before{flex:0 0 auto;font-weight:800}
.opt .pros li::before{content:"✓";color:#16a34a}
.opt .cons li::before{content:"✗";color:#dc2626}

/* Both buttons identical: styling the two options differently would recommend one of
   them, which is exactly what this page declines to do. */
.opt .go{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:800;
  background:var(--accent);color:#fff;border:1px solid transparent}
.opt .go:hover{filter:brightness(1.08)}

.same{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px 24px;margin:26px 0}
.same h2{margin:0 0 4px;font-size:1.1rem}
.same p.sub{margin:0 0 14px;color:var(--muted);font-size:.92rem}
/* Two columns, not auto-fit: these lines are sentences, and at three or four across they
   wrap mid-phrase and stop reading as a list. */
.same ul{margin:0;padding-inline-start:20px;display:grid;grid-template-columns:1fr 1fr;
  gap:10px 30px;font-size:.94rem}
.same ul li::marker{color:#16a34a}
@media (max-width:680px){.same ul{grid-template-columns:1fr}}
.back{display:block;text-align:center;margin:26px 0 0;color:var(--accent);text-decoration:none;font-weight:700}
.back:hover{text-decoration:underline}
`

// ---- document shell --------------------------------------------------------
/** Both pages differ only in title, description, page-specific css, and body. */
function page({ title, description, css, body }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- Declare that the page handles both schemes itself. Without this, browsers with
     "auto dark" (Chrome Auto Dark Mode, some mobile browsers) algorithmically invert the
     page: they darken the light-mode backgrounds but leave text dark → black-on-dark.
     Declaring color-scheme opts the page out of that and drives native controls/scrollbars. -->
<meta name="color-scheme" content="light dark" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%95%AF%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<style>${BASE_CSS}${css}</style>
</head>
<body>
${body}
</body>
</html>
`
}

const footerHtml = `<footer>
  <div class="wrap">
    <p class="note">${esc(
      'המידע נאסף מבדיקה חיה של כל אתר, מכתובת IP ישראלית, בשבת עצמה. אתר יכול לשנות את התנהלותו — אם מצאתם טעות, נשמח לעדכון.',
    )}</p>
    <p class="note">עודכן לאחרונה: ${esc(lastUpdate)} · <a href="${REPO_URL}/blob/main/data/sites.json" target="_blank" rel="noopener">מקור הנתונים</a> · <a href="${REPO_URL}/issues" target="_blank" rel="noopener">דיווח על אתר</a></p>
  </div>
</footer>`

// ---- the directory ---------------------------------------------------------
const directoryBody = `<header class="hero">
  <div class="wrap">
    <span class="badge">🕯️ תוסף דפדפן · מידע ציבורי</span>
    <h1>אילו אתרים סגורים בשבת?</h1>
    <p class="lead">רשימת אתרי המסחר הישראליים שומרי השבת שהתוסף «סגור בשבת» מסמן — כל רשומה אומתה חי (גלישה מישראל, בשבת), עם העדות שנמצאה וצילום מסך במידת האפשר.</p>
    <div class="cta">
      <a class="primary" href="install.html">⬇︎ להתקנת התוסף</a>
      <a href="${REPO_URL}/blob/main/PRIVACY.md" target="_blank" rel="noopener">מדיניות פרטיות</a>
      <a href="${REPO_URL}" target="_blank" rel="noopener">קוד המקור (GitHub)</a>
    </div>
    <div class="stats">
      <button class="stat active" data-filter="all" style="--c:var(--accent)"><b>${sites.length}</b><span>סה״כ אתרים</span></button>
      ${statBoxes}
    </div>
  </div>
</header>

<main class="wrap">
  <section class="legend" aria-label="הסבר הדרגות">
    ${legend}
  </section>

  <div class="toolbar">
    <label class="search"><input id="q" type="search" placeholder="חיפוש לפי שם, דומיין או קטגוריה…" aria-label="חיפוש" /></label>
    <span class="count-live" id="live">מציג ${sites.length} אתרים</span>
  </div>

  <section class="grid" id="grid">
    ${cardsHtml}
  </section>
  <p class="empty" id="empty">לא נמצאו אתרים התואמים לחיפוש.</p>
</main>

${footerHtml}

<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="צילום מסך">
  <button class="close" id="lbClose" aria-label="סגירה">×</button>
  <figure><img id="lbImg" src="" alt="" /><figcaption id="lbCap"></figcaption></figure>
</div>

<script>
(function(){
  var grid=document.getElementById('grid'),cards=[].slice.call(grid.querySelectorAll('.site'));
  var q=document.getElementById('q'),live=document.getElementById('live'),empty=document.getElementById('empty');
  var stats=[].slice.call(document.querySelectorAll('.stat'));
  var filter='all',term='';
  function apply(){
    var n=0;
    cards.forEach(function(c){
      var okF=filter==='all'||c.getAttribute('data-status')===filter;
      var okT=!term||c.getAttribute('data-search').indexOf(term)>-1;
      var show=okF&&okT;c.style.display=show?'':'none';if(show)n++;
    });
    live.textContent='מציג '+n+' אתרים';
    empty.style.display=n?'none':'block';
  }
  q.addEventListener('input',function(){term=this.value.trim().toLowerCase();apply();});
  stats.forEach(function(s){s.addEventListener('click',function(){
    filter=this.getAttribute('data-filter');
    stats.forEach(function(x){x.classList.toggle('active',x===s);});
    apply();window.scrollTo({top:0,behavior:'smooth'});
  });});
  // lightbox
  var lb=document.getElementById('lb'),lbImg=document.getElementById('lbImg'),lbCap=document.getElementById('lbCap');
  function close(){lb.classList.remove('open');lbImg.src='';}
  grid.addEventListener('click',function(e){
    var b=e.target.closest('.shot[data-full]');if(!b)return;
    lbImg.src=b.getAttribute('data-full');lbImg.alt=b.getAttribute('data-name')||'';
    lbCap.textContent=b.getAttribute('data-name')||'';lb.classList.add('open');
  });
  document.getElementById('lbClose').addEventListener('click',close);
  lb.addEventListener('click',function(e){if(e.target===lb)close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();
</script>`

// ---- the install / which-edition page --------------------------------------
/*
 * Two equal options, not a recommendation. The trade is genuine in both directions - a
 * narrower permission against a permission that never changes - and which side matters
 * more is the reader's call, not ours. So: same card, same button, no default, and the
 * cost of each stated as plainly as its benefit.
 *
 * Note the cons are the honest ones, including the one that counts against the edition
 * asking for more: under <all_urls> the narrowing to listed sites lives in the extension's
 * code rather than being enforced by the browser.
 */
const installBody = `<header class="hero">
  <div class="wrap">
    <span class="badge">🕯️ שתי גרסאות · אותה רשימה</span>
    <h1>שתי גרסאות — במה הן נבדלות?</h1>
    <p class="lead">שתי הגרסאות מסמנות בדיוק את אותם ${sites.length} אתרים ומתנהגות זהה. ההבדל היחיד ביניהן הוא היקף ההרשאה שהתוסף מבקש מהדפדפן — ולכל אחת מהאפשרויות יש יתרון וחיסרון.</p>
  </div>
</header>

<main class="wrap">
  <section class="options" aria-label="שתי הגרסאות">

    <article class="opt">
      <h2>סגור בשבת</h2>
      <div class="scope"><b>הרשאה:</b><span>${sites.length} האתרים שברשימה בלבד</span></div>
      <div class="col pros">
        <h3>יתרונות</h3>
        <ul>
          <li>הדפדפן נותן לתוסף גישה לאתרים שברשימה בלבד, ולא לאף אתר אחר.</li>
          <li>אפשר לראות בדף ההרשאות בדיוק לאילו אתרים לתוסף יש גישה.</li>
        </ul>
      </div>
      <div class="col cons">
        <h3>חסרונות</h3>
        <ul>
          <li>אתרים שנוספים לרשימה מגיעים אליכם רק עם עדכון גרסה של התוסף.</li>
          <li>כל עדכון שמוסיף אתרים מרחיב את ההרשאות, וייתכן שהדפדפן יבקש את אישורכם מחדש.</li>
        </ul>
      </div>
      <a class="go" href="${STORE_REGULAR}" target="_blank" rel="noopener">התקנה מחנות Chrome</a>
    </article>

    <article class="opt">
      <h2>סגור בשבת: רשימה מתעדכנת</h2>
      <div class="scope"><b>הרשאה:</b><span>כל האתרים</span></div>
      <div class="col pros">
        <h3>יתרונות</h3>
        <ul>
          <li>ההרשאה אינה משתנה בין גרסאות — הרשימה יכולה לגדול בלי בקשת אישור חדשה.</li>
          <li>אין הפסקה בפעולת התוסף בעקבות עדכון שמוסיף אתרים.</li>
        </ul>
      </div>
      <div class="col cons">
        <h3>חסרונות</h3>
        <ul>
          <li>הדפדפן מבקש הרשאת גישה לכל האתרים, גם לאלה שאינם ברשימה.</li>
          <li>ההגבלה לאתרים שברשימה נשמרת בקוד התוסף, ואינה נאכפת על ידי הדפדפן.</li>
        </ul>
      </div>
      <a class="go" href="${STORE_LIVE}" target="_blank" rel="noopener">התקנה מחנות Chrome</a>
    </article>

  </section>

  <section class="same">
    <h2>מה זהה בשתי הגרסאות</h2>
    <p class="sub">ההבדל הוא בהרשאה בלבד. כל השאר — אותו קוד, אותה רשימה, אותה התנהגות.</p>
    <ul>
      <li>הבאנר מוצג רק באתרים שברשימה.</li>
      <li>אין איסוף, שמירה או שידור של מידע כלשהו.</li>
      <li>התוסף אינו קורא את תוכן הדפים שבהם אתם גולשים.</li>
      <li>אותו קוד מקור, פתוח לבדיקה.</li>
    </ul>
  </section>

  <a class="back" href="./">← לרשימת האתרים המסומנים</a>
</main>

${footerHtml}`

// ---- emit ------------------------------------------------------------------
const html = page({
  title: 'סגור בשבת — רשימת האתרים',
  description:
    'רשימת אתרי המסחר הישראליים שומרי השבת המסומנים בתוסף «סגור בשבת», עם עדות אימות וצילומי מסך.',
  css: DIRECTORY_CSS,
  body: directoryBody,
})

const installHtml = page({
  title: 'סגור בשבת — איזו גרסה להתקין?',
  description:
    'שתי גרסאות של התוסף «סגור בשבת»: אותה רשימה ואותה התנהגות, בהיקף הרשאות שונה. הסבר קצר וקישורי התקנה.',
  css: INSTALL_CSS,
  body: installBody,
})

writeFileSync(join(OUT, 'index.html'), html)
writeFileSync(join(OUT, 'install.html'), installHtml)
// 404 fallback so deep links land on the directory.
writeFileSync(join(OUT, '404.html'), html)
writeFileSync(join(OUT, '.nojekyll'), '')

console.log(`site → ${OUT}`)
console.log(`  ${sites.length} sites, ${copied} screenshots copied`)
console.log('  pages: index.html, install.html, 404.html')
