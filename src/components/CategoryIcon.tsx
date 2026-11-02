import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDot,
  Footprints,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  push: ArrowUpFromLine,
  pull: ArrowDownToLine,
  legs: Footprints,
  core: CircleDot,
  other: Layers,
  mixed: Layers,
};

const TONES: Record<string, string> = {
  push: 'text-category-push',
  pull: 'text-category-pull',
  legs: 'text-category-legs',
  core: 'text-category-core',
  other: 'text-category-mixed',
  mixed: 'text-category-mixed',
};

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const key = category in ICONS ? category : 'other';
  const Icon = ICONS[key]!;
  return <Icon className={cn('h-4 w-4 shrink-0', TONES[key] ?? TONES.other, className)} aria-hidden />;
}
