import { resolveActivityIcon } from './activityIcons';
import type { Activity } from '@/lib/db/types';

/**
 * Activity icon component — colored with the activity's dot_class (e.g.
 * `bg-category-push` → `text-category-push`).
 */
export function ActivityIcon({
  activity,
  className,
}: {
  activity: Pick<Activity, 'key' | 'icon' | 'dot_class'>;
  className?: string;
}) {
  const Icon = resolveActivityIcon(activity);
  const color = activity.dot_class?.replace(/^bg-/, 'text-') ?? '';
  return <Icon className={[color, className].filter(Boolean).join(' ')} aria-hidden />;
}