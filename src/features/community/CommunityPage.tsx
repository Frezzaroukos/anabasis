import { useTranslation } from 'react-i18next';
import { FriendsSection } from '@/features/achievements/FriendsSection';

/**
 * «Κοινότητα» — η κοινωνική αρχική του Anabasis.
 *
 * Η ίδια ενότητα ζει και στη σελίδα «Η ανάβασή σου», αλλά εδώ είναι ο
 * προορισμός: leaderboard, φίλοι, αιτήματα και προφίλ, χωρίς να χάνεται
 * κάτω από badges και στατιστικά.
 */
export function CommunityPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('community.title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t('community.subtitle')}
        </p>
      </header>
      <FriendsSection showHeading={false} />
    </div>
  );
}
