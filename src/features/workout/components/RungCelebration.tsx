import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface RungCelebrationProps {
  /** true = μόλις έσπασε ρεκόρ — παίζει τη γιορτή μία φορά (mount = trigger). */
  active: boolean;
  className?: string;
}

/* Summit seal (brand mark, Logo.tsx, viewBox 64×64): δακτύλιος r=26 +
 * οροσειρά + σημαία στην κορυφή. Περιφέρεια = 2π·26 ≈ 163.36 (το ίδιο νούμερο
 * που περιμένει το summit-ring-draw στο globals.css). */
const RING_R = 26;
const RING_CIRC = 2 * Math.PI * RING_R;
const MOUNTAINS = 'M15 43 L25 27 L31 35 L39 21 L49 43 Z';
const SUMMIT = { x: 39, y: 21 } as const;

const PARTICLE_COUNT = 34;
const DURATION_MS = 900;

function readGold(): string {
  if (typeof window === 'undefined') return '#FBBF24';
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
  return raw ? `hsl(${raw})` : '#FBBF24';
}

/**
 * Macro γιορτή ρεκόρ (θεατρικό M3): η σφραγίδα του σήματος «σχεδιάζεται» —
 * ο δακτύλιος τραβιέται (stroke-dashoffset), η οροσειρά ανεβαίνει, μια χρυσή
 * σημαία καρφώνεται στην κορυφή — μαζί με σύντομο particle burst σε χρυσό
 * (hand-rolled canvas, όχι βιβλιοθήκη, ≤900ms). Αυτόνομο component — ο γονιός
 * απλά περνάει `active` (ίδιο pattern με το prCount auto-clear στο ExerciseCard).
 */
export function RungCelebration({ active, className }: RungCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // reduced-motion: μόνο το CSS fade των rungs (media query πιο κάτω) — καθόλου particles.
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const gold = readGold();
    const cx = width / 2;
    const cy = height / 2;
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.3;
      const speed = 0.8 + Math.random() * 1.4;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 1 + Math.random() * 1.2,
      };
    });

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      const life = Math.max(0, 1 - t / DURATION_MS);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = gold;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04; // ελαφριά βαρύτητα — η γιορτή κάθεται, δεν επιπλέει
        ctx.globalAlpha = life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (t < DURATION_MS) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className={cn('pointer-events-none relative flex items-center justify-center', className)}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="relative z-10 h-8 w-8">
        {/* Δακτύλιος: dasharray = περιφέρεια, dashoffset animεται προς 0 → «σχεδιάζεται».
            Ξεκινά από την κορυφή (rotate -90) ώστε να κλείνει «ανεβαίνοντας». */}
        <circle
          cx="32"
          cy="32"
          r={RING_R}
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth="4.5"
          className="animate-summit-ring"
          style={{
            strokeDasharray: RING_CIRC,
            transform: 'rotate(-90deg)',
            transformOrigin: '32px 32px',
          }}
        />
        {/* Οροσειρά: ανεβαίνει λίγο μετά τον δακτύλιο. */}
        <path
          d={MOUNTAINS}
          fill="hsl(var(--gold))"
          className="animate-summit-mountain"
          style={{ animationDelay: '260ms' }}
        />
        {/* Σημαία στην κορυφή: «καρφώνεται» τελευταία. */}
        <g className="animate-flag-pop" style={{ animationDelay: '520ms', transformOrigin: `${SUMMIT.x}px ${SUMMIT.y}px` }}>
          <rect x={SUMMIT.x} y={SUMMIT.y - 12} width="1.6" height="12" fill="hsl(var(--gold))" />
          <path d={`M${SUMMIT.x + 1.6} ${SUMMIT.y - 12} l7 2.5 l-7 2.5 z`} fill="hsl(var(--gold))" />
        </g>
      </svg>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
