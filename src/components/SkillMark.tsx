import { cn } from '@/lib/utils';

function initials(code: string | null | undefined, name: string): string {
  const raw = (code ?? '').trim();
  if (raw) return raw.slice(0, 3).toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function SkillMark({
  code,
  name,
  className,
}: {
  code?: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/15',
        className,
      )}
    >
      {initials(code, name)}
    </span>
  );
}
