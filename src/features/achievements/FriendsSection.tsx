/**
 * Social ενότητα της «Ανάβασης» — φίλοι, αιτήματα, πίνακας κατάταξης, δημόσιο
 * προφίλ. Εμφανίζεται μόνο σε συνδεδεμένο χρήστη (τα social ζουν στον server).
 * Offline → ήπιο μήνυμα, όχι σφάλμα. Καμία διαρροή raw δεδομένων — μόνο aggregate.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserPlus, Check, X, Users, Globe, Mountain, Flame, Award } from 'lucide-react';
import { getGamificationInput } from '@/lib/db/queries';
import { useAuth } from '@/lib/api/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSocial, badgeCount, type LeaderboardScope } from './useSocial';
import type { FriendRow, LeaderboardRow } from '@/lib/api/types';

export function FriendsSection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const enabled = auth != null;
  const input = useLiveQuery(() => getGamificationInput(), [], null);
  const [state, actions] = useSocial(enabled, input);

  if (!enabled) {
    return (
      <section className="rounded-xl bg-card p-6 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t('social.signInPrompt')}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-display text-lg font-semibold tracking-tight">{t('social.title')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('social.subtitle')}</p>
      </header>

      {state.offline ? (
        <p className="rounded-xl bg-card p-4 text-center text-sm text-muted-foreground">
          {t('social.offline')}
        </p>
      ) : (
        <>
          <ProfileCard me={state.me} onSave={actions.updateProfile} />
          <AddFriend onAdd={actions.addFriend} />
          <Requests requests={state.requests} onAccept={actions.accept} onRemove={actions.remove} />
          <Leaderboard
            rows={state.leaderboard}
            scope={state.scope}
            onScope={actions.setScope}
            loading={state.loading}
          />
          <FriendsManage friends={state.friends} onRemove={actions.remove} />
        </>
      )}
    </div>
  );
}

// ── Προφίλ (username + share) ──────────────────────────────────────────────────

function ProfileCard({
  me,
  onSave,
}: {
  me: import('@/lib/api/types').SocialMe | null;
  onSave: (p: { username?: string; share_profile?: boolean }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!me) return null;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await onSave({ username });
    setSaving(false);
    if (res.ok) {
      setUsername('');
      setMsg(t('social.profile.saved'));
    } else {
      setMsg(t(`social.profile.err.${res.error}`, { defaultValue: t('social.profile.err.generic') }));
    }
  };

  return (
    <section className="rounded-xl bg-card p-4">
      {me.username ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('social.profile.usernameLabel')}
            </p>
            <p className="font-mono text-sm">@{me.username}</p>
          </div>
          <ShareToggle
            on={me.share_profile}
            onToggle={(v) => onSave({ share_profile: v })}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('social.profile.noUsername')}</p>
          <div className="flex gap-2">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('social.profile.usernamePlaceholder')}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
            />
            <Button onClick={save} disabled={saving || username.trim().length < 3}>
              {t('social.profile.save')}
            </Button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </section>
  );
}

function ShareToggle({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
      className="flex items-center gap-2 text-right"
    >
      <span className="text-[11px] leading-tight text-muted-foreground">
        {t('social.profile.share')}
      </span>
      <span
        className={`relative h-6 w-10 rounded-full transition-colors ${
          on ? 'bg-primary' : 'bg-elevated'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

// ── Πρόσθεσε φίλο ──────────────────────────────────────────────────────────────

function AddFriend({
  onAdd,
}: {
  onAdd: (u: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    const res = await onAdd(username);
    setBusy(false);
    if (res.ok) {
      setUsername('');
      setMsg({ ok: true, text: t('social.add.sent') });
    } else {
      setMsg({
        ok: false,
        text: t(`social.add.err.${res.error}`, { defaultValue: t('social.add.err.generic') }),
      });
    }
  };

  return (
    <section className="rounded-xl bg-card p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('social.add.title')}
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t('social.add.placeholder')}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
        />
        <Button type="submit" disabled={busy || username.trim().length < 3}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </form>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

// ── Εισερχόμενα αιτήματα ────────────────────────────────────────────────────────

function Requests({
  requests,
  onAccept,
  onRemove,
}: {
  requests: FriendRow[];
  onAccept: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const incoming = requests.filter((r) => r.direction === 'in');
  if (incoming.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('social.requests.title')}
      </p>
      <ul className="space-y-2">
        {incoming.map((r) => (
          <li key={r.account_id} className="flex items-center justify-between">
            <NameCell row={r} />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => onAccept(r.account_id)} aria-label={t('social.requests.accept')}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(r.account_id)}
                aria-label={t('social.requests.decline')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Πίνακας κατάταξης ───────────────────────────────────────────────────────────

function Leaderboard({
  rows,
  scope,
  onScope,
  loading,
}: {
  rows: LeaderboardRow[];
  scope: LeaderboardScope;
  onScope: (s: LeaderboardScope) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('social.board.title')}
        </p>
        <div className="flex rounded-lg bg-elevated p-0.5 text-xs">
          <ScopeTab active={scope === 'friends'} onClick={() => onScope('friends')}>
            <Users className="h-3.5 w-3.5" />
            {t('social.board.friends')}
          </ScopeTab>
          <ScopeTab active={scope === 'global'} onClick={() => onScope('global')}>
            <Globe className="h-3.5 w-3.5" />
            {t('social.board.global')}
          </ScopeTab>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          {loading ? '…' : t('social.board.empty')}
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li
              key={`${r.username ?? 'anon'}-${i}`}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
                r.is_self ? 'bg-elevated' : ''
              }`}
            >
              <span className="w-6 text-center font-mono text-sm tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.display_name || (r.username ? `@${r.username}` : t('social.anon'))}
                  {r.is_self && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {t('social.board.you')}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{t(`gami.tier.${r.tier}`)}</span>
                  <Flair streakDays={r.streak_days} badges={r.badges} />
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-sm font-semibold tabular-nums">
                  {t('social.board.level')} {r.level}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {r.xp.toLocaleString()} XP
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ScopeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// ── Διαχείριση φίλων (remove) ───────────────────────────────────────────────────

function FriendsManage({
  friends,
  onRemove,
}: {
  friends: FriendRow[];
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (friends.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('social.friends.title')} · {friends.length}
        </span>
        <span className="text-xs text-muted-foreground">{open ? t('social.friends.hide') : t('social.friends.manage')}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {friends.map((f) => (
            <li key={f.account_id} className="flex items-center justify-between">
              <NameCell row={f} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(f.account_id)}
                aria-label={t('social.friends.remove')}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NameCell({ row }: { row: FriendRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Mountain className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {row.display_name || (row.username ? `@${row.username}` : t('social.anon'))}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {t('social.board.level')} {row.level} · {row.xp.toLocaleString()} XP
          </span>
          <Flair streakDays={row.streak_days} badges={row.badges} />
        </div>
      </div>
    </div>
  );
}

/** Streak flame (>0) + πλήθος summit badges — κοινωνική απόδειξη σε μία γραμμή. */
function Flair({ streakDays, badges }: { streakDays: number; badges: string }) {
  const count = badgeCount(badges);
  if (streakDays <= 0 && count === 0) return null;
  return (
    <span className="flex items-center gap-1.5 tabular-nums">
      {streakDays > 0 && (
        <span className="flex items-center gap-0.5 text-[hsl(var(--gold))]">
          <Flame className="h-3 w-3" />
          {streakDays}
        </span>
      )}
      {count > 0 && (
        <span className="flex items-center gap-0.5">
          <Award className="h-3 w-3" />
          {count}
        </span>
      )}
    </span>
  );
}
