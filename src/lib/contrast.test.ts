import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Διαβάζουμε το globals.css ως πηγή αλήθειας (βλ. node-shims.d.ts για τις
// ελάχιστες node:fs/node:path δηλώσεις — το app tsconfig δεν έχει @types/node).
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

/**
 * Φρουρός contrast (WCAG 2.2 AA) για τα text tokens του θέματος.
 *
 * Διαβάζει τις HSL μεταβλητές απευθείας από το `globals.css` (μία πηγή
 * αλήθειας — αν κάποιος αλλάξει χρώμα, το test το πιάνει) και υπολογίζει τον
 * λόγο φωτεινότητας με τον τύπο της WCAG. Καλύπτει τα ζεύγη κειμένου/φόντου
 * που όντως χρησιμοποιούνται· δεν μαντεύει «όλα με όλα».
 */

type Hsl = [number, number, number];

function parseBlock(css: string, selector: string): Record<string, Hsl> {
  // Παίρνει το block `selector { ... }` (π.χ. `:root` ή `.dark`) και εξάγει
  // όλες τις `--token: H S% L%;` τριάδες.
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`block ${selector} not found`);
  const open = css.indexOf('{', start);
  // ισορροπημένα braces ώστε να πάρουμε ΟΛΟ το block (τα .dark nested rules).
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const vars: Record<string, Hsl> = {};
  const re = /--([a-z0-9-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    vars[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return vars;
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const hh = h / 360;
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh * 6) % 2) - 1));
  const m0 = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(hh * 6) % 6;
  if (sector === 0) [r, g, b] = [c, x, 0];
  else if (sector === 1) [r, g, b] = [x, c, 0];
  else if (sector === 2) [r, g, b] = [0, c, x];
  else if (sector === 3) [r, g, b] = [0, x, c];
  else if (sector === 4) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m0, g + m0, b + m0];
}

function channelLum(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channelLum) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Χρώμα fg με alpha `a` πάνω σε bg — για badges (text πάνω σε tint /12). */
function composite(fg: Hsl, bg: Hsl, a: number): [number, number, number] {
  const f = hslToRgb(fg).map(channelLum) as [number, number, number];
  const b = hslToRgb(bg).map(channelLum) as [number, number, number];
  return f.map((v, i) => a * v + (1 - a) * b[i]!) as [number, number, number];
}

function ratioOnTint(fg: Hsl, bg: Hsl, a: number): number {
  const tintL = relativeLuminance(composite(fg, bg, a));
  const fgL = relativeLuminance(hslToRgb(fg));
  const hi = Math.max(fgL, tintL);
  const lo = Math.min(fgL, tintL);
  return (hi + 0.05) / (lo + 0.05);
}

const light = parseBlock(css, ':root {');
// `.dark {` (με κενό) για να μη πιάσει το `@custom-variant dark (… .dark *)`.
const dark = parseBlock(css, '.dark {');

const AA = 4.5;

/** [foregroundToken, backgroundToken, minRatio] ζεύγη που χρησιμοποιούνται. */
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'elevated'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['gold-strong', 'background'],
  ['gold-strong', 'card'],
  ['gold-strong', 'elevated'],
  ['cat-push', 'card'],
  ['cat-pull', 'card'],
  ['cat-legs', 'card'],
  ['cat-core', 'card'],
  ['cat-mixed', 'card'],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('contrast — %s theme (WCAG AA 4.5:1)', (_name, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s ≥ 4.5:1', (fg, bg) => {
    const ratio = contrastRatio(tokens[fg]!, tokens[bg]!);
    expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
  });

  it('button foregrounds pass on their own fills', () => {
    expect(contrastRatio(tokens['primary-foreground']!, tokens['primary']!)).toBeGreaterThanOrEqual(AA);
    expect(
      contrastRatio(tokens['destructive-foreground']!, tokens['destructive']!),
    ).toBeGreaterThanOrEqual(AA);
  });

  it('category badges (text on its 12% tint) pass', () => {
    for (const cat of ['cat-push', 'cat-pull', 'cat-legs', 'cat-core', 'cat-mixed']) {
      const ratio = ratioOnTint(tokens[cat]!, tokens['card']!, 0.12);
      expect(ratio, `${cat} badge = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
    }
  });
});
