import { findBang } from '../data/bangs';
import { engineUrl } from '../data/engines';
import type { EngineId, SmartAnalysis, SmartIntent } from '../types';

/* ------------------------------------------------------------------ *
 * Safe arithmetic parser (no eval, no Function constructor).
 * ------------------------------------------------------------------ */

const FN: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, log: Math.log10,
  ln: Math.log, log10: Math.log10, log2: Math.log2, exp: Math.exp,
  round: Math.round, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  sign: Math.sign, cbrt: Math.cbrt,
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  pow: (a, b) => Math.pow(a, b),
  sum: (...a) => a.reduce((x, y) => x + y, 0),
  avg: (...a) => a.reduce((x, y) => x + y, 0) / (a.length || 1),
};

const CONST: Record<string, number> = {
  pi: Math.PI, 'π': Math.PI, e: Math.E, tau: Math.PI * 2, phi: 1.618033988749895,
};

class Parser {
  private i = 0;
  constructor(private s: string) {}

  parse(): number {
    const v = this.expr();
    this.ws();
    if (this.i < this.s.length) throw new Error(`Unexpected "${this.s[this.i]}"`);
    if (!Number.isFinite(v)) throw new Error('Result is not finite');
    return v;
  }

  private ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }

  private expr(): number {
    let v = this.term();
    for (;;) {
      this.ws();
      const c = this.s[this.i];
      if (c === '+') { this.i++; v += this.term(); }
      else if (c === '-') { this.i++; v -= this.term(); }
      else break;
    }
    return v;
  }

  private term(): number {
    let v = this.unary();
    for (;;) {
      this.ws();
      const c = this.s[this.i];
      if (c === '*') { this.i++; v *= this.unary(); }
      else if (c === '/') { this.i++; const d = this.unary(); if (d === 0) throw new Error('Division by zero'); v /= d; }
      else if (c === '%') { this.i++; const d = this.unary(); if (d === 0) throw new Error('Modulo by zero'); v %= d; }
      else if (c === '×') { this.i++; v *= this.unary(); }
      else if (c === '÷') { this.i++; v /= this.unary(); }
      else break;
    }
    return v;
  }

  private power(): number {
    let v = this.atom();
    for (;;) {
      this.ws();
      if (this.s[this.i] === '^') { this.i++; v = Math.pow(v, this.unary()); }
      else break;
    }
    return v;
  }

  private unary(): number {
    this.ws();
    if (this.s[this.i] === '-') { this.i++; return -this.unary(); }
    if (this.s[this.i] === '+') { this.i++; return this.unary(); }
    return this.power();
  }

  private atom(): number {
    this.ws();
    const rest = this.s.slice(this.i);

    const fn = /^([a-zA-Z]+)\s*\(/.exec(rest);
    if (fn) {
      const name = fn[1].toLowerCase();
      if (!Object.hasOwn(FN, name)) throw new Error(`Unknown function ${fn[1]}`);
      this.i += fn[0].length;
      const args: number[] = [];
      this.ws();
      if (this.s[this.i] !== ')') {
        args.push(this.expr());
        while (this.s[this.i] === ',' || this.s[this.i] === ';') { this.i++; args.push(this.expr()); }
      }
      this.ws();
      if (this.s[this.i] !== ')') throw new Error('Missing closing parenthesis');
      this.i++;
      return FN[name](...args);
    }

    if (this.s[this.i] === '(') {
      this.i++;
      const v = this.expr();
      this.ws();
      if (this.s[this.i] !== ')') throw new Error('Missing closing parenthesis');
      this.i++;
      return v;
    }

    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (num) { this.i += num[0].length; return parseFloat(num[0]); }

    const cst = /^(pi|π|tau|phi|φ|e)\b/i.exec(rest);
    if (cst) { this.i += cst[0].length; return CONST[cst[1].toLowerCase()]; }

    throw new Error(`Unexpected "${rest.slice(0, 8)}"`);
  }
}

export function calculate(input: string): number | null {
  let s = input.trim().toLowerCase()
    .replace(/^(what\s+is|what's|calculate|calc|compute|solve|equals?|=)\s*/i, '')
    .replace(/[?=]\s*$/, '')
    .trim();
  if (!s || s.length > 500) return null;

  const hasFn = /^(sqrt|abs|sin|cos|tan|log|ln|exp|round|floor|ceil|min|max|pow|sum|avg)\s*\(/i.test(s);
  const pureMath = /^[\d\s+\-*/^%().,×÷]+$/.test(s) && /[+\-*/^%×÷]/.test(s);
  const withConst = /^[\d\s+\-*/^%().,×÷πφa-z]+$/i.test(s) && /\b(pi|π|e|tau|phi)\b/i.test(s) && /[+\-*/^%×÷]/.test(s);
  if (!hasFn && !pureMath && !withConst) return null;

  try { return new Parser(s).parse(); } catch { return null; }
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Math.round(n * 1e10) / 1e10;
  if (Number.isInteger(rounded)) return rounded.toLocaleString('en-US');
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

/* ------------------------------------------------------------------ *
 * Unit conversion
 * ------------------------------------------------------------------ */

type UnitDef = { group: string; factor: number; label: string; aliases: string[] };

const UNITS: UnitDef[] = [
  { group: 'length', factor: 0.001, label: 'mm', aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'] },
  { group: 'length', factor: 0.01, label: 'cm', aliases: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
  { group: 'length', factor: 1, label: 'm', aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
  { group: 'length', factor: 1000, label: 'km', aliases: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'] },
  { group: 'length', factor: 0.0254, label: 'in', aliases: ['in', 'inch', 'inches'] },
  { group: 'length', factor: 0.3048, label: 'ft', aliases: ['ft', 'foot', 'feet'] },
  { group: 'length', factor: 0.9144, label: 'yd', aliases: ['yd', 'yard', 'yards'] },
  { group: 'length', factor: 1609.344, label: 'mi', aliases: ['mi', 'mile', 'miles'] },
  { group: 'length', factor: 1852, label: 'nmi', aliases: ['nmi', 'nautical mile', 'nautical miles'] },

  { group: 'mass', factor: 0.001, label: 'mg', aliases: ['mg', 'milligram', 'milligrams'] },
  { group: 'mass', factor: 1, label: 'g', aliases: ['g', 'gram', 'grams'] },
  { group: 'mass', factor: 1000, label: 'kg', aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  { group: 'mass', factor: 28.349523125, label: 'oz', aliases: ['oz', 'ounce', 'ounces'] },
  { group: 'mass', factor: 453.59237, label: 'lb', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { group: 'mass', factor: 6350.29318, label: 'st', aliases: ['st', 'stone'] },

  { group: 'data', factor: 1, label: 'B', aliases: ['b', 'byte', 'bytes'] },
  { group: 'data', factor: 1024, label: 'KB', aliases: ['kb', 'kilobyte', 'kilobytes'] },
  { group: 'data', factor: 1048576, label: 'MB', aliases: ['mb', 'megabyte', 'megabytes'] },
  { group: 'data', factor: 1073741824, label: 'GB', aliases: ['gb', 'gigabyte', 'gigabytes'] },
  { group: 'data', factor: 1099511627776, label: 'TB', aliases: ['tb', 'terabyte', 'terabytes'] },
  { group: 'data', factor: 125000, label: 'Mb', aliases: ['mbit', 'megabit', 'megabits'] },
  { group: 'data', factor: 125000000, label: 'Gb', aliases: ['gbit', 'gigabit', 'gigabits'] },

  { group: 'time', factor: 0.001, label: 'ms', aliases: ['ms', 'millisecond', 'milliseconds'] },
  { group: 'time', factor: 1, label: 's', aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
  { group: 'time', factor: 60, label: 'min', aliases: ['min', 'mins', 'minute', 'minutes'] },
  { group: 'time', factor: 3600, label: 'h', aliases: ['h', 'hr', 'hrs', 'hour', 'hours'] },
  { group: 'time', factor: 86400, label: 'd', aliases: ['d', 'day', 'days'] },
  { group: 'time', factor: 604800, label: 'wk', aliases: ['wk', 'week', 'weeks'] },

  { group: 'speed', factor: 1, label: 'm/s', aliases: ['m/s', 'mps', 'meters per second'] },
  { group: 'speed', factor: 0.277778, label: 'km/h', aliases: ['kmh', 'km/h', 'kph', 'kilometers per hour'] },
  { group: 'speed', factor: 0.44704, label: 'mph', aliases: ['mph', 'miles per hour'] },

  { group: 'volume', factor: 0.001, label: 'mL', aliases: ['ml', 'milliliter', 'milliliters', 'millilitre'] },
  { group: 'volume', factor: 1, label: 'L', aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  { group: 'volume', factor: 3.785411784, label: 'gal', aliases: ['gal', 'gallon', 'gallons'] },
];

const TEMP: Record<string, string> = {
  c: 'C', '°c': 'C', celsius: 'C', centigrade: 'C',
  f: 'F', '°f': 'F', fahrenheit: 'F',
  k: 'K', kelvin: 'K',
};

const UNIT_LOOKUP = new Map<string, UnitDef>();
UNITS.forEach((u) => u.aliases.forEach((a) => UNIT_LOOKUP.set(a, u)));

export interface ConversionResult {
  value: string;
  from: string;
  to: string;
  detail: string;
}

function toCelsius(v: number, unit: string): number {
  if (unit === 'C') return v;
  if (unit === 'F') return (v - 32) * 5 / 9;
  return v - 273.15; // K
}
function fromCelsius(v: number, unit: string): number {
  if (unit === 'C') return v;
  if (unit === 'F') return v * 9 / 5 + 32;
  return v + 273.15;
}

export function convert(input: string): ConversionResult | null {
  const cleaned = input.trim().toLowerCase()
    .replace(/^(convert|what\s+is|how\s+many)\s+/i, '')
    .replace(/[?=]\s*$/, '')
    .trim();

  const m = /^(-?\d+(?:\.\d+)?)\s*([a-z°/.,\s]*?)\s*(?:to|in|as|into|=>|=)\s+([a-z°/.\s]+)$/i.exec(cleaned);
  if (!m) return null;

  const amount = parseFloat(m[1]);
  const a = m[2].trim().replace(/\s+/g, ' ');
  const b = m[3].trim().replace(/\s+/g, ' ');
  if (!a || !b) return null;

  const ta = TEMP[a];
  const tb = TEMP[b];
  if (ta && tb) {
    const out = fromCelsius(toCelsius(amount, ta), tb);
    return {
      value: `${formatNumber(Math.round(out * 1e6) / 1e6)}°${tb}`,
      from: `${amount}°${ta}`, to: `°${tb}`,
      detail: `${amount}°${ta} equals ${formatNumber(Math.round(out * 1e6) / 1e6)}°${tb}`,
    };
  }

  const ua = UNIT_LOOKUP.get(a);
  const ub = UNIT_LOOKUP.get(b);
  if (!ua || !ub || ua.group !== ub.group) return null;

  const out = amount * ua.factor / ub.factor;
  return {
    value: `${formatNumber(Math.round(out * 1e8) / 1e8)} ${ub.label}`,
    from: `${amount} ${ua.label}`, to: ub.label,
    detail: `${amount} ${ua.label} = ${formatNumber(Math.round(out * 1e8) / 1e8)} ${ub.label}`,
  };
}

export const UNIT_GROUPS = Array.from(new Set(UNITS.map((u) => u.group)));
export function unitsFor(group: string): UnitDef[] { return UNITS.filter((u) => u.group === group); }
export function convertUnits(amount: number, from: string, to: string): number | null {
  const ua = UNIT_LOOKUP.get(from.toLowerCase());
  const ub = UNIT_LOOKUP.get(to.toLowerCase());
  if (!ua || !ub || ua.group !== ub.group) return null;
  return amount * ua.factor / ub.factor;
}

/* ------------------------------------------------------------------ *
 * Color
 * ------------------------------------------------------------------ */

export interface ColorInfo {
  hex: string; rgb: string; hsl: string; css: string; luminance: number; suggestedText: string;
}

export function parseColor(input: string): ColorInfo | null {
  const s = input.trim().toLowerCase().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return null;
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * lin(rn) + 0.7152 * lin(gn) + 0.0722 * lin(bn);

  return {
    hex: `#${full.toUpperCase()}`,
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%)`,
    css: `--loxiro-accent: #${full.toUpperCase()};`,
    luminance: Math.round(lum * 1000) / 1000,
    suggestedText: lum > 0.45 ? '#14151A' : '#FFFFFF',
  };
}

/* ------------------------------------------------------------------ *
 * URL + intent detection
 * ------------------------------------------------------------------ */

const TLD = /\.(com|org|net|io|dev|app|ai|co|gov|edu|me|xyz|info|biz|tech|so|gg|tv|us|uk|de|fr|es|gt|mx|br|ca|au|jp|in|cn|ru|nl|se|no|fi|it|ch|at|be|pl|cz|eu)$/i;

export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) { try { return new URL(s).toString(); } catch { return null; } }
  if (/^www\./i.test(s)) return `https://${s}`;
  if (/\s/.test(s)) return null;
  const host = s.split('/')[0].split(':')[0];
  if (host.includes('.') && TLD.test(host) && !host.startsWith('.') && !host.endsWith('.')) {
    return `https://${s}`;
  }
  return null;
}

const CODE_WORDS = /\b(error|exception|bug|stack ?trace|undefined|null|npm|yarn|node|react|vue|angular|typescript|javascript|python|rust|golang|java|sql|regex|api|json|css|html|git|docker|linux|compile|build|function|const|async|await|import|export|class|props|hook)\b/i;
const QUESTION_WORDS = /^(what|who|when|where|why|how|which|can|could|does|do|is|are|was|were|will|should|explain|define|meaning of)\b/i;
const CODE_HINT = /[{}();=><]|=>|::|\bfunction\b|\bconst\b|\bTypeError\b|\bError\b/;

function recommend(q: string, fallback: EngineId): { engine: EngineId; reason: string } {
  if (/\b(near me|restaurant|coffee|hotel|address|directions|map)\b/i.test(q)) return { engine: 'maps', reason: 'Looks like a place lookup' };
  if (/\b(photo|image|picture|wallpaper|screenshot|logo)\b/i.test(q)) return { engine: 'images', reason: 'Looks like a visual search' };
  if (/\b(video|tutorial|song|music|watch|playlist|podcast)\b/i.test(q)) return { engine: 'youtube', reason: 'Looks like a video search' };
  if (/\b(news|headline|today|latest|breaking)\b/i.test(q)) return { engine: 'news', reason: 'Looks like a news query' };
  if (/\b(repo|repository|github|open source|package|library|sdk)\b/i.test(q)) return { engine: 'github', reason: 'Looks like a code search' };
  if (/\b(meaning|define|definition|dictionary|what does .* mean)\b/i.test(q)) return { engine: 'wikipedia', reason: 'Looks like a definition' };
  if (CODE_HINT.test(q) && CODE_WORDS.test(q)) return { engine: 'stackoverflow', reason: 'Looks like a code error' };
  if (QUESTION_WORDS.test(q) || q.endsWith('?')) return { engine: 'perplexity', reason: 'Looks like a question — an answer engine fits best' };
  return { engine: fallback, reason: 'Standard web search' };
}

export function analyze(rawQuery: string, fallback: EngineId = 'duckduckgo'): SmartAnalysis {
  const q = rawQuery.trim();
  const tokens = q.split(/\s+/).filter(Boolean);
  const base = (patch: Partial<SmartAnalysis>): SmartAnalysis => ({
    intent: 'search', headline: 'Web search', engine: fallback, confidence: 0.6,
    tokens, cleanQuery: q, ...patch,
  });

  if (!q) return base({ intent: 'empty', headline: 'Start typing', confidence: 0 });

  // Bang shortcut (leading or trailing)
  const leadingBang = /^!([a-z0-9]+)\s*(.*)$/i.exec(q);
  const trailingBang = /^(.*?)\s+!([a-z0-9]+)\s*$/i.exec(q);
  const bangMatch = leadingBang || trailingBang;
  if (bangMatch) {
    const key = leadingBang ? bangMatch[1] : bangMatch[2];
    const rest = (leadingBang ? bangMatch[2] : bangMatch[1]).trim();
    const bang = findBang(key);
    if (bang) {
      return base({
        intent: 'bang', bang, cleanQuery: rest,
        headline: `${bang.description} search`, engine: bang.engine,
        value: rest || `Search ${bang.description}`,
        detail: rest ? `“${rest}” → ${bang.description}` : `Opens ${bang.description}`,
        url: rest ? engineUrl(bang.engine, rest) : undefined,
        confidence: 0.98,
      });
    }
  }

  // URL
  const url = normalizeUrl(q);
  if (url) {
    return base({
      intent: 'url', headline: 'Website detected', value: url, url,
      detail: 'Open it, save it, or send it to the download queue.',
      engine: fallback, confidence: 0.99,
    });
  }

  // Time / date
  if (/^(what('|')?s|what is|current|now)?\s*(the\s*)?(time|date|day|today('|')?s date)\??$/i.test(q) || /^time$/i.test(q)) {
    const now = new Date();
    return base({
      intent: 'time', headline: 'Right now',
      value: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      detail: now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      confidence: 1,
    });
  }

  // Color
  const color = parseColor(q);
  if (color) {
    return base({
      intent: 'color', headline: 'Color decoded', value: color.hex,
      detail: `${color.rgb} · ${color.hsl} · relative luminance ${color.luminance}`,
      confidence: 0.99,
    });
  }

  // Calculation
  const calc = calculate(q);
  if (calc !== null) {
    return base({
      intent: 'calculation', headline: 'Instant calculation',
      value: formatNumber(calc), detail: `${q.replace(/[?=]\s*$/, '').trim()} =`,
      confidence: 0.99,
    });
  }

  // Conversion
  const conv = convert(q);
  if (conv) {
    return base({
      intent: 'conversion', headline: 'Instant conversion',
      value: conv.value, detail: `${conv.from} → ${conv.to}`,
      confidence: 0.99,
    });
  }

  const rec = recommend(q, fallback);
  return base({
    intent: CODE_WORDS.test(q) && CODE_HINT.test(q) ? 'code' : (QUESTION_WORDS.test(q) || q.endsWith('?') ? 'question' : 'search'),
    headline: rec.reason,
    detail: `Best route: ${rec.engine === 'duckduckgo' ? 'DuckDuckGo' : rec.engine.charAt(0).toUpperCase() + rec.engine.slice(1)}`,
    engine: rec.engine,
    url: engineUrl(rec.engine, q),
    confidence: rec.engine === fallback ? 0.65 : 0.88,
  });
}

export function relatedSearches(q: string): string[] {
  const clean = q.replace(/^![a-z0-9]+\s*/i, '').trim();
  if (!clean) return [];
  const mods = [
    `${clean} explained`, `${clean} examples`, `${clean} vs alternatives`,
    `best ${clean}`, `${clean} tutorial`, `${clean} 2026`,
    `how does ${clean} work`, `${clean} documentation`,
  ];
  return mods.slice(0, 6);
}

export function textStats(text: string) {
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const words = (text.match(/\S+/g) || []).length;
  const sentences = (text.match(/[.!?]+(?:\s|$)/g) || []).length || (text.trim() ? 1 : 0);
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const minutes = words ? Math.max(1, Math.round(words / 220)) : 0;
  return { chars, charsNoSpaces, words, sentences, lines, minutes };
}
