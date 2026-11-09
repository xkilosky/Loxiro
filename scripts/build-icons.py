#!/usr/bin/env python3
"""Rebuild the Veilix app icons from the authored master mark.

The mark lives once, as a flat PNG at docs/assets/veilix-mark-source.png.
This script recolours it into the Arctic palette, scales it into the
Android maskable safe zone, traces its outlines into polygons, and emits
every raster and vector asset the web and Android shells need:

    public/icons/icon-512.png        PWA icon (maskable-safe)
    public/icons/icon-192.png        PWA icon
    public/icons/icon-32.png         favicon
    public/icons/icon-16.png         favicon
    public/icons/icon.svg            vector master / favicon
    android/app/src/main/res/drawable/ic_veilix.xml

Every asset comes from the same traced polygons, so the app icon, the
favicon and the in-app mark cannot drift apart again. Run this after
replacing the source PNG:

    python3 scripts/build-icons.py

Uses only the standard library (zlib + struct) so it runs anywhere.
"""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/assets/veilix-mark-source.png'

# Arctic palette (BrowserPalette.java / app.css)
ACCENT = (0x5F, 0xD9, 0xF0)      # #5FD9F0  main strokes
HIGHLIGHT = (0xA9, 0xEE, 0xFA)   # #A9EEFA  the luminous accent stroke
TILE = (0x08, 0x0B, 0x14)        # #080B14  icon tile

# Android masks a maskable icon to the centre 80% circle, so the mark is
# scaled down until its furthest point sits inside that radius.
SAFE_SCALE = 0.85
TILE_RADIUS = 0.2266             # matches the previous icon (rx=116/512)

TRACE_N = 480                    # resolution used to trace outlines
RASTER_SS = 3                    # supersampling per axis when rasterising


# ---------------------------------------------------------------- PNG codec

def read_png(path):
    """Decode an 8-bit truecolour or truecolour+alpha PNG into rows of RGB."""
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, ihdr = 8, b'', None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b'IHDR':
            ihdr = struct.unpack('>IIBBBBB', chunk)
        elif kind == b'IDAT':
            idat += chunk
        elif kind == b'IEND':
            break
    w, h, depth, ctype, _, _, _ = ihdr
    assert depth == 8 and ctype in (2, 6), 'need 8-bit RGB/RGBA'
    nch = 3 if ctype == 2 else 4
    raw = zlib.decompress(idat)
    stride = w * nch
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i + stride]); i += stride
        if f == 1:
            for x in range(nch, stride):
                line[x] = (line[x] + line[x - nch]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - nch] if x >= nch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - nch] if x >= nch else 0
                b = prev[x]
                c = prev[x - nch] if x >= nch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 255
        rows.append([(line[x * nch], line[x * nch + 1], line[x * nch + 2])
                     for x in range(w)])
        prev = line
    return w, h, rows


def write_png(path, w, h, rows):
    """Encode rows of (r,g,b) as an 8-bit truecolour PNG."""
    def chunk(kind, payload):
        return (struct.pack('>I', len(payload)) + kind + payload +
                struct.pack('>I', zlib.crc32(kind + payload) & 0xFFFFFFFF))

    raw = bytearray()
    for row in rows:
        raw.append(0)                       # filter: none
        for r, g, b in row:
            raw += bytes((r, g, b))
    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
           chunk(b'IEND', b''))
    path.write_bytes(png)
    return len(png)


# ------------------------------------------------------- mask and polygons

def build_masks(w, h, rows):
    """Classify every sampled pixel of the master mark.

    Returns {'accent': [(x, y)], 'highlight': [(x, y)]} in normalised
    [0,1] coordinates, sampling on a TRACE_N grid.
    """
    step_x = max(1, w // TRACE_N)
    step_y = max(1, h // TRACE_N)
    accent, highlight = [], []
    for y in range(0, h, step_y):
        for x in range(0, w, step_x):
            r, g, b = rows[y][x]
            if g > r + 40 and g > b + 40:
                accent.append((x / w, y / h))
            elif r > 150 and g > 150 and b > 150:
                highlight.append((x / w, y / h))
    return {'accent': accent, 'highlight': highlight}


def runs_of_row(points, y, tol):
    """Group the sampled x values on one scanline into contiguous runs."""
    xs = sorted(x for (x, yy) in points if abs(yy - y) <= tol)
    runs = []
    for x in xs:
        if runs and x - runs[-1][1] <= 2.5 / TRACE_N:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    return [(a, b) for a, b in runs]


def outline(points):
    """Trace one straight-edged component into a closed polygon.

    The shapes in the mark are thick, simply connected and have a single
    run per scanline, so the boundary is the left edge of each run walked
    downwards followed by the right edge walked back up. Douglas-Peucker
    then collapses the staircase onto the true straight edges.
    """
    ys = sorted({round(y, 4) for (_, y) in points})
    if len(ys) < 2:
        return None
    tol = (ys[1] - ys[0]) * 0.6
    left, right = [], []
    for y in ys:
        runs = runs_of_row(points, y, tol)
        if not runs:
            continue
        left.append((runs[0][0], y))
        right.append((runs[-1][1], y))
    if len(left) < 2:
        return None
    ring = left + right[::-1]
    # The ring closes on itself; drop the duplicate so Douglas-Peucker is not
    # asked to simplify across a zero-length anchor chord.
    if len(ring) > 2 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return douglas_peucker(ring, 0.6 / TRACE_N)


def coverage_at(rows, sy, sx, key):
    """Fraction of one source pixel covered by the given mark colour.

    The master is antialiased onto black, so each channel is proportional
    to coverage. The green excess separates the accent from the white
    highlight, which shares the green channel.
    """
    r, g, b = rows[sy][sx]
    if key == 'accent':
        return max(0.0, min(1.0, (g - r) / 88.0))
    if g - r > 44:
        return 0.0
    return max(0.0, min(1.0, min(r, g, b) / 255.0))


def subpixel_outline(rows, w, h, comp, key):
    """Trace a component using sub-pixel edges from the antialiased source.

    Integer run endpoints leave the outline a staircase that sits inside the
    true edge, thinning every stroke. Interpolating the 50% crossing of the
    per-pixel coverage puts the boundary where it actually is.
    """
    step_x = max(1, w // TRACE_N)
    step_y = max(1, h // TRACE_N)
    by_row = {}
    for x, y in comp:
        by_row.setdefault(round(y * TRACE_N), []).append(x)

    left, right = [], []
    for cy in sorted(by_row):
        sy = min(cy * step_y, h - 1)
        y = sy / h
        xs = sorted(by_row[cy])
        x0 = max(0, int(xs[0] * w) - 2 * step_x)
        x1 = min(w - 1, int(xs[-1] * w) + 2 * step_x)
        runs, start, prev = [], None, 0.0
        for sx in range(x0, x1 + 1):
            c = coverage_at(rows, sy, sx, key)
            if c > 0.5 >= prev:
                start = sx - 1 + (0.5 - prev) / (c - prev)
            elif prev > 0.5 >= c and start is not None:
                runs.append((start / w, (sx - 1 + (0.5 - prev) / (c - prev)) / w))
                start = None
            prev = c
        if start is not None:
            runs.append((start / w, x1 / w))
        if runs:
            left.append((runs[0][0], y))
            right.append((runs[-1][1], y))
    if len(left) < 2:
        return None
    ring = left + right[::-1]
    if len(ring) > 2 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return douglas_peucker(ring, 0.6 / TRACE_N)


def douglas_peucker(points, eps):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5 or 1e-9
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > best:
                best, bi = d, k
        if best > eps:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(points, keep) if k]


def to_output(poly, n):
    """Map a normalised polygon into n x n output pixels, applying SAFE_SCALE."""
    out = []
    for sx, sy in poly:
        out.append((n * (0.5 + (sx - 0.5) * SAFE_SCALE),
                    n * (0.5 + (sy - 0.5) * SAFE_SCALE)))
    return out


# ------------------------------------------------------------- rasterising

def coverage(poly, n, ss=RASTER_SS):
    """Antialiased coverage of `poly` over an n x n grid, as row lists."""
    cov = [[0.0] * n for _ in range(n)]
    m = len(poly)
    for sub in range(n * ss):
        y = (sub + 0.5) / ss
        row = sub // ss
        xs = []
        for k in range(m):
            ax, ay = poly[k]
            bx, by = poly[(k + 1) % m]
            if (ay <= y < by) or (by <= y < ay):
                xs.append(ax + (y - ay) * (bx - ax) / (by - ay))
        if len(xs) < 2:
            continue
        xs.sort()
        line = cov[row]
        for i in range(n):
            lo, hi = float(i), float(i + 1)
            left = sum(1 for x in xs if x < lo)
            inside = left % 2 == 1
            edges = [lo] + [x for x in xs if lo < x < hi] + [hi]
            acc = 0.0
            for a, b in zip(edges, edges[1:]):
                if inside:
                    acc += b - a
                inside = not inside
            if acc:
                line[i] += acc / ss
    return cov


def render(n, layers):
    """Composite the tile, then each (polygon, colour) layer in order."""
    acc = [[list(TILE) for _ in range(n)] for _ in range(n)]
    for poly, colour in layers:
        for y, row in enumerate(coverage(poly, n)):
            for x, c in enumerate(row):
                if c <= 0:
                    continue
                px = acc[y][x]
                for ch in range(3):
                    px[ch] = px[ch] * (1 - c) + colour[ch] * c
    return [[tuple(round(v) for v in px) for px in row] for row in acc]


# ------------------------------------------------------------------ output

def fmt(v):
    return ('%.3f' % v).rstrip('0').rstrip('.')


def svg_path(poly, n, close=True):
    pts = ' '.join('%s,%s' % (fmt(x), fmt(y)) for x, y in poly)
    return ('M' + pts + ('Z' if close else ''))


def main():
    global poly_colour

    w, h, rows = read_png(SOURCE)
    print(f'source: {SOURCE.relative_to(ROOT)}  {w}x{h}')

    masks = build_masks(w, h, rows)
    total = sum(len(v) for v in masks.values())
    print(f'sampled {total} mark pixels on a {TRACE_N} grid '
          f'({len(masks["accent"])} accent, {len(masks["highlight"])} highlight)')
    assert total > 500, 'master mark looks empty'

    # Trace every connected component of every colour into a polygon.
    # Stray single-pixel speckles from the source's antialiasing are dropped.
    layers = []
    for key, colour in (('accent', ACCENT), ('highlight', HIGHLIGHT)):
        for comp in components(masks[key]):
            if len(comp) < 20:
                continue
            poly = subpixel_outline(rows, w, h, comp, key)
            if poly and len(poly) >= 3:
                layers.append((poly, colour))
    print(f'traced {len(layers)} polygon(s): ' +
          ', '.join(str(len(p)) + ' vertices' for p, _ in layers))

    # --- raster icons
    for size in (512, 192, 32, 16):
        out = ROOT / 'public/icons' / f'icon-{size}.png'
        rows_out = render(size, [(to_output(p, size), c) for p, c in layers])
        nbytes = write_png(out, size, size, rows_out)
        print(f'wrote {out.relative_to(ROOT)}  ({nbytes} bytes)')

    # --- vector master (512 viewBox)
    parts = [f'<rect width="512" height="512" rx="{round(TILE_RADIUS*512)}" fill="#080B14"/>']
    for poly, colour in layers:
        # Explicit L commands: implicit lineto after M is core SVG, but spelling
        # it out costs nothing and keeps the two generators identical.
        pts = ' L'.join('%s,%s' % (fmt(x * 512), fmt(y * 512)) for x, y in poly)
        parts.append('<path d="M%sZ" fill="#%02X%02X%02X"/>' % (pts, *colour))
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
           'viewBox="0 0 512 512">' + ''.join(parts) + '</svg>')
    (ROOT / 'public/icons/icon.svg').write_text(svg)
    print(f'wrote public/icons/icon.svg  ({len(svg)} bytes)')

    # --- Android vector (108dp viewport)
    aparts = []
    for poly, colour in layers:
        pts = ' L'.join('%s,%s' % (fmt(x * 108), fmt(y * 108)) for x, y in poly)
        aparts.append('    <path android:fillColor="#%02X%02X%02X" '
                      'android:pathData="M%sZ" />' % (*colour, pts))
    vector = (
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="108dp"\n'
        '    android:height="108dp"\n'
        '    android:viewportWidth="108"\n'
        '    android:viewportHeight="108">\n'
        '    <path android:fillColor="#080B14" '
        'android:pathData="M0,0h108v108h-108z" />\n'
        + '\n'.join(aparts) + '\n</vector>\n')
    (ROOT / 'android/app/src/main/res/drawable/ic_veilix.xml').write_text(vector)
    print(f'wrote android/app/src/main/res/drawable/ic_veilix.xml '
          f'({len(vector)} bytes)')

    # --- verification
    verify(layers, masks, w, h, rows)


def components(points):
    """Split sampled pixels into connected groups (4-neighbourhood)."""
    grid = {}
    for x, y in points:
        grid[(round(x * TRACE_N), round(y * TRACE_N))] = (x, y)
    seen, out = set(), []
    for start in grid:
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            cx, cy = stack.pop()
            comp.append(grid[(cx, cy)])
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nxt = (cx + dx, cy + dy)
                if nxt in grid and nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        out.append(comp)
    return out


def verify(layers, masks, w, h, rows):
    """Rasterise the traced polygons and compare against the master mark."""
    print('\nverifying traced geometry against the master mark...')
    n = 256
    step = max(1, w // n)
    ok = True

    def to_out(sx, sy):
        """Source-normalised -> output-normalised (inverse of to_output)."""
        return (0.5 + (sx - 0.5) * SAFE_SCALE, 0.5 + (sy - 0.5) * SAFE_SCALE)

    for key, colour in (('accent', ACCENT), ('highlight', HIGHLIGHT)):
        # master mark, resampled onto the output grid
        want = [[False] * n for _ in range(n)]
        found = False
        for y in range(0, h, step):
            for x in range(0, w, step):
                r, g, b = rows[y][x]
                hit = (g > r + 40 and g > b + 40) if key == 'accent' else \
                      (r > 150 and g > 150 and b > 150)
                if not hit:
                    continue
                ox, oy = to_out(x / w, y / h)
                cx, cy = int(ox * n), int(oy * n)
                if 0 <= cx < n and 0 <= cy < n:
                    want[cy][cx] = True
                    found = True
        if not found:
            continue

        # traced polygons, rasterised on the same grid
        got = [[False] * n for _ in range(n)]
        for poly, c in layers:
            if c != colour:
                continue
            for y, row in enumerate(coverage(to_output(poly, n), n, ss=1)):
                for x, v in enumerate(row):
                    if v > 0.5:
                        got[y][x] = True

        total = sum(1 for r in want for v in r if v)
        hit = sum(1 for y in range(n) for x in range(n) if want[y][x] and got[y][x])
        pct = 100.0 * hit / max(1, total)
        # How much of the traced polygon lands outside the master. A polygon
        # that is strictly inside the mark only thins the strokes; one that
        # spills outside would visibly change the shape.
        got_total = sum(1 for r in got for v in r if v)
        outside = sum(1 for y in range(n) for x in range(n)
                      if got[y][x] and not want[y][x])
        spill = 100.0 * outside / max(1, got_total)
        # A boundary pixel is genuinely ambiguous -- where "the mark" ends is
        # a matter of antialiasing -- so require near-total recall and only
        # forbid the polygon spilling meaningfully outside the master.
        good = pct >= 95 and spill <= 2
        ok = ok and good
        print(f'  {key:>9}: {pct:5.1f}% of master reproduced, '
              f'{spill:4.1f}% of polygon spills outside  '
              f'[{"OK" if good else "LOW"}]')

    # Android masks a maskable icon to the centre 80% circle; the furthest
    # point of a polygon from the centre is always a vertex, so vertices
    # suffice. The mark is drawn at SAFE_SCALE, so measure it that way.
    worst = max((((x - 0.5) ** 2 + (y - 0.5) ** 2) ** 0.5) * SAFE_SCALE
                for poly, _ in layers for x, y in poly)
    good = worst <= 0.4
    ok = ok and good
    print(f'  maskable safe zone: furthest mark point {worst:.3f} of 0.400 '
          f'-> [{"OK" if good else "OUTSIDE"}]')
    print('  all checks passed' if ok else '  CHECKS FAILED')
    return ok


if __name__ == '__main__':
    main()
