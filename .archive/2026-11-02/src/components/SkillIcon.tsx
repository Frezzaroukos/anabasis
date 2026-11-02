import type { ReactNode, SVGProps } from 'react';

type SkillIconKey =
  | 'muscle-up'
  | 'front-lever'
  | 'back-lever'
  | 'planche'
  | 'handstand'
  | 'human-flag'
  | 'one-arm-chinup'
  | 'v-sit'
  | 'default';

// short_code (π.χ. "Fl") ή name ("Front Lever") — ό,τι έρθει, lower-cased.
const SHORT_CODE_MAP: Record<string, SkillIconKey> = {
  mu: 'muscle-up',
  fl: 'front-lever',
  bl: 'back-lever',
  pl: 'planche',
  hs: 'handstand',
  hf: 'human-flag',
  oac: 'one-arm-chinup',
  vs: 'v-sit',
};

const NAME_MAP: Record<string, SkillIconKey> = {
  'muscle up': 'muscle-up',
  'front lever': 'front-lever',
  'back lever': 'back-lever',
  planche: 'planche',
  handstand: 'handstand',
  'human flag': 'human-flag',
  'one arm chin-up': 'one-arm-chinup',
  'one arm chinup': 'one-arm-chinup',
  'v-sit': 'v-sit',
  'v sit': 'v-sit',
};

function resolveIconKey(value: string): SkillIconKey {
  const normalized = value.trim().toLowerCase();
  return SHORT_CODE_MAP[normalized] ?? NAME_MAP[normalized] ?? 'default';
}

// Σιλουέτες σώματος στη ΘΕΣΗ κάθε skill — γραμμικά, viewBox 24x24, currentColor.
const ICONS: Record<SkillIconKey, ReactNode> = {
  // Στήριξη πάνω από τη μπάρα — τερματικό σημείο του muscle up.
  'muscle-up': (
    <>
      <path d="M3 7 H21" />
      <circle cx="12" cy="3.4" r="1.3" />
      <path d="M12 4.7 L8.5 7 M12 4.7 L15.5 7 M12 4.7 L12 8.2 M12 8.2 L10 11 M12 8.2 L14 11" />
    </>
  ),
  // Σώμα οριζόντιο, ίσιο, κρεμασμένο από μπάρα — front lever.
  'front-lever': (
    <>
      <path d="M3 4 H21" />
      <path d="M7 4 L7 7" />
      <circle cx="8.4" cy="7" r="1.3" />
      <path d="M9.8 7 H20" />
    </>
  ),
  // Ίδια θέση με front lever αλλά ελαφρά καμπύλη πλάτης — back lever.
  'back-lever': (
    <>
      <path d="M3 4 H21" />
      <path d="M7 4 L7 7" />
      <circle cx="8.4" cy="7" r="1.3" />
      <path d="M9.8 7 Q15 9.4 20 7" />
    </>
  ),
  // Σώμα οριζόντιο σε στήριξη χεριών στο έδαφος — planche.
  planche: (
    <>
      <path d="M3 20 H21" />
      <path d="M7 20 L7 17" />
      <circle cx="8.4" cy="17" r="1.3" />
      <path d="M9.8 17 H20" />
    </>
  ),
  // Ανάποδο σώμα σε στήριξη χεριών — handstand.
  handstand: (
    <>
      <path d="M3 21 H21" />
      <path d="M9 21 L12 17 M15 21 L12 17" />
      <circle cx="12" cy="17.3" r="1.2" />
      <path d="M12 16 V4" />
      <path d="M9.5 4 H14.5" />
    </>
  ),
  // Σώμα οριζόντιο πλαγίως, χέρια σε κατακόρυφο ιστό — human flag.
  'human-flag': (
    <>
      <path d="M6 2 V22" />
      <path d="M6 9 L9 10.5 M6 12 L9 10.5" />
      <circle cx="10.8" cy="10.5" r="1.2" />
      <path d="M12.2 10.5 H20" />
    </>
  ),
  // Ένα χέρι τεντωμένο στη μπάρα, το άλλο διπλωμένο στο στήθος.
  'one-arm-chinup': (
    <>
      <path d="M3 4 H21" />
      <path d="M12 4 L12 7" />
      <circle cx="12" cy="8.3" r="1.3" />
      <path d="M12 9.6 V16" />
      <path d="M12 16 L10.5 20 M12 16 L13.5 20" />
      <path d="M12 11 L9.5 10" />
    </>
  ),
  // Compression hold σε σχήμα V — κορμός και πόδια ανυψωμένα.
  'v-sit': (
    <>
      <path d="M12 17 L10 20 M12 17 L14 20" />
      <path d="M12 17 L8.5 10" />
      <circle cx="8" cy="9" r="1.3" />
      <path d="M12 17 L17 9" />
    </>
  ),
  // Fallback για custom skills χωρίς αντίστοιχο εικονίδιο — γενικό αστέρι.
  default: (
    <path d="M12 3 L14.5 9.5 L21 10 L16 14.5 L17.5 21 L12 17.5 L6.5 21 L8 14.5 L3 10 L9.5 9.5 Z" />
  ),
};

interface SkillIconProps extends SVGProps<SVGSVGElement> {
  /** short_code (π.χ. "Fl") ή name (π.χ. "Front Lever") του skill. */
  skill: string;
}

export function SkillIcon({ skill, ...props }: SkillIconProps) {
  const key = resolveIconKey(skill);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {ICONS[key]}
    </svg>
  );
}
