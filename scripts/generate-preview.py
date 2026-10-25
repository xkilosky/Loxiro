#!/usr/bin/env python3
"""Generate the self-contained Loxiro preview page and the downloadable bundle.

Run from the repository root:
    python3 scripts/generate-preview.py
    npm run build          # stages dist/ and .vercel/output/static/

The generated index.html embeds the concept board (PNG), the editable SVG,
the full plan (Markdown) and the downloadable ZIP as base64, so the page works
from file:// or any static host with zero network requests.
"""

import base64
import io
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

png = (ROOT / "docs/assets/loxiro-concept.png").read_bytes()
svg = (ROOT / "docs/assets/loxiro-concept.svg").read_bytes()
md = (ROOT / "docs/PROJECT_PLAN.md").read_bytes()
readme = (ROOT / "README.md").read_bytes()

# NOTE: index.html is intentionally NOT included in the ZIP (its own base64 is
# embedded in the page), which avoids a circular dependency.
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("loxiro-preview/README.md", readme)
    archive.writestr("loxiro-preview/docs/PROJECT_PLAN.md", md)
    archive.writestr("loxiro-preview/docs/assets/loxiro-concept.svg", svg)
    archive.writestr("loxiro-preview/docs/assets/loxiro-concept.png", png)
zip_bytes = buffer.getvalue()
(ROOT / "loxiro-plan-preview.zip").write_bytes(zip_bytes)

b64 = lambda data: base64.b64encode(data).decode("ascii")
PNG, SVG, MD, ZIP = b64(png), b64(svg), b64(md), b64(zip_bytes)

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loxiro — Preview &amp; Downloads</title>
<style>
:root{--paper:#F7F6F2;--surface:#fff;--ink:#14151A;--muted:#6E6F74;--faint:#A9AAAE;--line:#E7E6E1;--accent:#3B5BFF;--accent-soft:#EDF0FF;}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:920px;margin:0 auto;padding:48px 24px 80px}
.badge{display:inline-block;background:var(--accent-soft);color:#2B3C9C;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:6px 10px;border-radius:999px;margin-bottom:24px}
header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
h1{font-size:44px;letter-spacing:-.04em;font-weight:650;margin:0}
.dot{width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;margin-left:-4px;transform:translateY(-18px)}
.tag{color:var(--muted);font-size:14px;margin:8px 0 0}
.offline{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#2B3C9C;background:var(--accent-soft);padding:5px 10px;border-radius:999px;margin-left:8px;vertical-align:middle}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:16px;margin:28px 0;box-shadow:0 4px 16px rgba(20,21,26,.05);text-align:center}
.card img{max-width:100%;height:auto;border-radius:12px;display:block;margin:0 auto;min-height:120px;background:#FBFBF9}
.buttons{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0 40px}
a.btn,button.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 20px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--ink);transition:transform .15s ease,background .15s ease;min-height:48px;cursor:pointer;font-family:inherit}
a.btn:hover,button.btn:hover{transform:translateY(-1px)}
a.btn.primary,button.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
a.btn.primary:hover,button.btn.primary:hover{background:#2F4BE0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:32px 0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px}
.tile h3{margin:0 0 6px;font-size:15px}
.tile p{margin:0;color:var(--muted);font-size:13px}
details{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-top:16px}
summary{cursor:pointer;font-weight:600;font-size:15px}
pre{white-space:pre-wrap;word-wrap:break-word;font-size:12px;color:var(--muted);max-height:520px;overflow:auto;background:#FBFBF9;border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:16px}
.svgbox{text-align:center;margin-top:16px}
.svgbox img{max-width:260px;width:100%;border:1px solid var(--line);border-radius:12px}
footer{margin-top:48px;color:var(--faint);font-size:12px;text-align:center}
@media(max-width:600px){.wrap{padding:32px 18px 60px}h1{font-size:36px}.buttons{flex-direction:column}a.btn,button.btn{width:100%}}
</style>
</head>
<body>
<div class="wrap">
  <div class="badge">Planning preview · v0.1</div>
  <header><h1>Loxiro</h1><span class="dot"></span><span class="offline">● Self-contained · works offline</span></header>
  <p class="tag">Search, without the noise. — The concept board and full plan, ready to preview or download. Everything on this page is embedded, so downloads work even without a connection.</p>

  <div class="card">
    <img id="concept" alt="Loxiro home screen concept">
  </div>

  <div class="buttons">
    <button class="btn primary" onclick="dlPage()">Download this page (.html)</button>
    <button class="btn" onclick="dl('loxiro-plan-preview.zip','application/zip',ZIP)">Download plan bundle (.zip)</button>
    <button class="btn" onclick="dl('loxiro-concept.png','image/png',PNG)">Download PNG</button>
    <button class="btn" onclick="dl('loxiro-concept.svg','image/svg+xml',SVG)">Download SVG</button>
    <button class="btn" onclick="dl('PROJECT_PLAN.md','text/markdown;charset=utf-8',MD)">Download plan (.md)</button>
  </div>

  <div class="grid">
    <div class="tile"><h3>Concept board</h3><p>Home screen visual north star — editable SVG + high-res PNG, both embedded here.</p></div>
    <div class="tile"><h3>Full plan</h3><p>Vision, scope, design system, architecture, roadmap, and open questions.</p></div>
    <div class="tile"><h3>Next up</h3><p>Say &ldquo;build it&rdquo; and I'll turn this into an interactive, installable PWA preview.</p></div>
  </div>

  <details open>
    <summary>Read the full project plan</summary>
    <pre id="planText">Loading plan…</pre>
  </details>

  <details>
    <summary>View the editable SVG source</summary>
    <div class="svgbox"><img id="svgPreview" alt="Loxiro concept SVG"></div>
    <pre id="svgText" style="max-height:260px"></pre>
  </details>

  <footer>Loxiro · Plan draft v0.1 · 2026-10-24</footer>
</div>

<script>
const PNG = __PNG__;
const SVG = __SVG__;
const MD  = __MD__;
const ZIP = __ZIP__;

function bytes(b64){
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  return a;
}
function text(b64){ return new TextDecoder('utf-8').decode(bytes(b64)); }
function save(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function dl(name, mime, b64){ save(new Blob([bytes(b64)], {type: mime}), name); }
function dlPage(){
  const src = '<!doctype html>\n' + document.documentElement.outerHTML;
  save(new Blob([src], {type: 'text/html;charset=utf-8'}), 'loxiro-preview.html');
}

document.getElementById('concept').src = 'data:image/png;base64,' + PNG;
document.getElementById('svgPreview').src = 'data:image/svg+xml;base64,' + SVG;
document.getElementById('planText').textContent = text(MD);
document.getElementById('svgText').textContent = text(SVG);
</script>
</body>
</html>
"""

page = (
    TEMPLATE.replace("__PNG__", json.dumps(PNG))
    .replace("__SVG__", json.dumps(SVG))
    .replace("__MD__", json.dumps(MD))
    .replace("__ZIP__", json.dumps(ZIP))
)
(ROOT / "index.html").write_text(page, encoding="utf-8")

print(f"index.html: {len(page)} chars")
print(f"loxiro-plan-preview.zip: {len(zip_bytes)} bytes")
