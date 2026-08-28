import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface RungCelebrationProps {
  /** true = μόλις έσπασε ρεκόρ — παίζει τη γιορτή μία φορά (mount = trigger). */
  active: boolean;
  className?: string;
}

/** Ίδιες αναλογίες με το brand mark (branding/logo-v2/mark.svg, viewBox 64×64):
 * 4 rungs που στοιβάζονται σε σιλουέτα κορυφής, από το στενό (κορυφή) στο
 * φαρδύ (βάση). Εδώ «γεμίζουν» ένα-ένα από κάτω προς τα πάνω — η ανάβαση. */
const RUNGS = [
  { x: 28, y: 9, width: 8, height: 7 },
  { x: 21, y: 22, width: 22, height: 7 },
  { x: 14, y: 35, width: 36, height: 7 },
  { x: 7, y: 48, width: 50, height: 7 },
] as const;

const PARTICLE_COUNT = 14;
const DURATION_MS = 600;

function readGold(): string {
  if (typeof window === 'undefined') return '#FBBF24';
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
  return raw ? `hsl(${raw})` : '#FBBF24';
}

/**
 * Macro γιορτή ρεκόρ («ανέβασμα σκαλιού», DESIGN-SPEC-V2 §Motion): το mark
 * των 4 rungs γεμίζει σκαλί-σκαλί από κάτω προς τα πάνω + σύντομο particle
 * burst σε χρυσό (hand-rolled canvas, όχι βιβλιοθήκη). Αυτόνομο component —
 * ο γονιός απλά περνάει `active` (ίδιο pattern με το prCount auto-clear που
 * ήδη υπάρχει στο ExerciseCard).
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
      <svg viewBox="0 0 64 64" className="relative z-10 h-7 w-7">
        <g fill="hsl(var(--gold))">
          {RUNGS.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              rx={3.5}
              className="rung-celebration-piece"
              style={{ animationDelay: `${(RUNGS.length - 1 - i) * 100}ms` }}
            />
          ))}
        </g>
      </svg>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <style>{`
        @keyframes rung-celebration-fill {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rung-celebration-piece {
          opacity: 0;
          animation: rung-celebration-fill 200ms cubic-bezier(0.22, 1.2, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .rung-celebration-piece {
            animation-duration: 1ms;
            animation-delay: 0ms !important;
          }
        }
      `}</style>
    </div>
  );
}
