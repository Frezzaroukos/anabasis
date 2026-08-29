/**
 * Κοινή γλώσσα για ΟΛΑ τα charts (DESIGN-SPEC-V2 §Charts):
 * λεπτή accent γραμμή 1.5-2px + gradient area fill (accent 18% → διάφανο)
 * + απαλό glow στο ενεργό σημείο. ΕΝΑ accent ανά chart — τα semantic χρώματα
 * μένουν για status, ποτέ για διακόσμηση.
 *
 * Τα Recharts SVG attributes δεν διαβάζουν CSS vars σε <linearGradient>,
 * γι' αυτό το gradient ορίζεται ως component με hsl(var(--...)) — o browser
 * τα λύνει κανονικά μέσα στο SVG.
 */

export const CHART_STROKE = 'hsl(var(--primary))';
export const CHART_STROKE_WIDTH = 1.75;
export const CHART_GRID = 'hsl(var(--border) / 0.6)';
export const CHART_TICK = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  fontFamily: 'JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
} as const;
export const CHART_GOLD = 'hsl(var(--gold))';

/** id που περνάς σε fill="url(#…)" του <Area>. */
export const ACCENT_FILL_ID = 'anabasis-accent-fill';
export const GOLD_FILL_ID = 'anabasis-gold-fill';

/** Active dot με glow — πέρασέ το στο activeDot των Line/Area. */
export const ACTIVE_DOT = {
  r: 4,
  strokeWidth: 0,
  style: { filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.65))' },
} as const;

/** Βάλε ΜΙΑ φορά μέσα στο chart (πριν τα Area/Line) τα κοινά gradients. */
export function ChartGradientDefs() {
  return (
    <defs>
      <linearGradient id={ACCENT_FILL_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={GOLD_FILL_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.16} />
        <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

/** Κοινό tooltip style — elevated επιφάνεια, όχι default λευκό κουτί. */
export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--elevated))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  color: 'hsl(var(--foreground))',
  fontSize: 12,
} as const;
