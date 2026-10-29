/**
 * Social ενότητα της «Ανάβασης» — φίλοι, αιτήματα, πίνακας κατάταξης, δημόσιο
 * προφίλ. Εμφανίζεται μόνο σε συνδεδεμένο χρήστη (τα social ζουν στον server).
 * Offline → ήπιο μήνυμα, όχι σφάλμα. Καμία διαρροή raw δεδομένων — μόνο aggregate.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  UserPlus,
  Check,
  X,
  Users,
  Globe,
  Mountain,
  Flame,
  Award,
  Share2,
  QrCode,
  Copy,
  Pencil,
  Search,
  Send,
  Inbox,
} from 'lucide-react';
import { getGamificationInput } from '@/lib/db/queries';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/sheet';
import { QRCodeSVG } from 'qrcode.react';
import {
  useSocial,
  badgeCount,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from './useSocial';
import type { FriendRow, LeaderboardRow } from '@/lib/api/types';

export function FriendsSection({ showHeading = true }: { showHeading?: boolean } = {}) {
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
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/settings/account">{t('social.signInCta')}</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {showHeading && (
        <header>
          <h2 className="font-display text-lg font-semibold tracking-tight">{t('social.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('social.subtitle')}</p>
        </header>
      )}

      {state.offline && (
        <p className="rounded-xl border border-border/60 bg-card p-3 text-center text-xs text-muted-foreground">
          {t('social.offlineCached')}
        </p>
      )}
      {/* Offline → me είναι null (δεν κρατάμε cache), οπότε το ProfileCard κρύβεται
          μόνο του· τα υπόλοιπα δείχνουν last-known από το cache. */}
      <ProfileCard me={state.me} onSave={actions.updateProfile} />
      <AddFriend onAdd={actions.addFriend} />
      <Connections
        friends={state.friends}
        requests={state.requests}
        onAccept={actions.accept}
        onRemove={actions.remove}
      />
      <Leaderboard
        rows={state.leaderboard}
        scope={state.scope}
        onScope={actions.setScope}
        period={state.period}
        onPeriod={actions.setPeriod}
        loading={state.loading}
      />
    </div>
  );
}

// ── Προφίλ (username + display name + share) ───────────────────────────────────

function ProfileCard({
  me,
  onSave,
}: {
  me: import('@/lib/api/types').SocialMe | null;
  onSave: (p: {
    username?: string;
    display_name?: string;
    share_profile?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(me?.username ?? '');
  const [displayName, setDisplayName] = useState(me?.display_name ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) return;
    setUsername(me?.username ?? '');
    setDisplayName(me?.display_name ?? '');
  }, [editing, me?.username, me?.display_name]);

  if (!me) return null;

  const save = async () => {
    const handle = username.trim();
    if (!me.username && handle.length < 3) {
      setMsg(t('social.profile.err.invalid_username'));
      return;
    }
    const patch: { username?: string; display_name?: string } = {};
    if (handle && handle !== me.username) patch.username = handle;
    if (displayName.trim() !== (me.display_name ?? '')) patch.display_name = displayName.trim();
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await onSave(patch);
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      setMsg(t('social.profile.saved'));
    } else {
      setMsg(t(`social.profile.err.${res.error}`, { defaultValue: t('social.profile.err.generic') }));
    }
  };

  const stats = [
    { label: t('social.profile.friendsCount'), value: me.friends_count },
    { label: t('social.profile.incomingCount'), value: me.incoming_count },
    { label: t('social.profile.sentCount'), value: me.outgoing_count },
  ];

  return (
    <section className="rounded-xl bg-card p-4">
      {me.username ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={me.display_name || `@${me.username}`} self size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold">
                {me.display_name || `@${me.username}`}
              </p>
              <p className="font-mono text-xs text-muted-foreground">@{me.username}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setEditing((v) => !v);
                setMsg(null);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('social.profile.edit')}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-elevated p-2 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-sm font-semibold tabular-nums">{stat.value}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {editing && (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <FieldRow label={t('social.profile.usernameLabel')}>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={20}
                />
              </FieldRow>
              <FieldRow label={t('social.profile.displayNameLabel')}>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('social.profile.displayNamePlaceholder')}
                  maxLength={40}
                />
              </FieldRow>
              <p className="text-[11px] text-muted-foreground">{t('social.profile.usernameHint')}</p>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setUsername(me.username ?? '');
                    setDisplayName(me.display_name ?? '');
                    setMsg(null);
                  }}
                >
                  {t('common.cancel')}
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving}>
                  {saving ? t('common.loading') : t('social.profile.save')}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <ShareToggle on={me.share_profile} onToggle={(v) => onSave({ share_profile: v })} />
            </div>
            {me.share_profile ? (
              <InviteButton username={me.username} />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t('social.profile.privateHint')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('social.profile.noUsername')}</p>
          <FieldRow label={t('social.profile.usernameLabel')}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('social.profile.usernamePlaceholder')}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
            />
          </FieldRow>
          <FieldRow label={t('social.profile.displayNameLabel')}>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('social.profile.displayNamePlaceholder')}
              maxLength={40}
            />
          </FieldRow>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving || username.trim().length < 3}>
              {saving ? t('common.loading') : t('social.profile.save')}
            </Button>
          </div>
        </div>
      )}
      {msg && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Viral loop: μοιράσου το username σου ώστε να σε προσθέτουν φίλοι. Native
 * share όπου υπάρχει, αλλιώς clipboard fallback (ίδιο pattern με το ShareCard). */
export function InviteButton({ username }: { username: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const url = `${window.location.origin}/u/${username}`;
  const text = t('social.profile.inviteText', { url });

  const copy = async (value: string, setDone: (v: boolean) => void) => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* clipboard μπλοκαρισμένο — no-op, όχι crash */
    }
  };

  const invite = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ text });
        return;
      } catch {
        /* ο χρήστης ακύρωσε ή δεν υποστηρίζεται — πέσε στο clipboard */
      }
    }
    await copy(text, setCopied);
  };

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={invite} className="min-w-0 flex-1 gap-2">
          <Share2 className="h-4 w-4" />
          {copied ? t('social.profile.inviteCopied') : t('social.profile.invite')}
        </Button>
        <Button
          variant="outline"
          aria-label={t('social.profile.qr')}
          title={t('social.profile.qr')}
          onClick={() => setQrOpen(true)}
          className="w-11 shrink-0 px-0"
        >
          <QrCode className="h-4 w-4" />
        </Button>
      </div>
      <BottomSheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title={t('social.profile.qrTitle')}
        className="md:mx-auto md:max-w-md md:rounded-t-2xl md:border-x"
      >
        <div className="flex flex-col items-center gap-4 px-5 pb-8 pt-5 text-center">
          <div className="rounded-2xl bg-white p-3 shadow-elevated-sm">
            <QRCodeSVG
              value={url}
              size={200}
              level="M"
              bgColor="#ffffff"
              fgColor="#0c0a08"
              marginSize={2}
              title={t('social.profile.qrTitle')}
            />
          </div>
          <div>
            <p className="font-mono text-sm">@{username}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              {t('social.profile.qrHint')}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => copy(url, setLinkCopied)}
            className="w-full gap-2"
          >
            <Copy className="h-4 w-4" />
            {linkCopied ? t('social.profile.linkCopied') : t('social.profile.copyLink')}
          </Button>
        </div>
      </BottomSheet>
    </>
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
      <span className="text-xs leading-tight text-muted-foreground">
        {t('social.profile.share')}
      </span>
      <span
        className={`relative h-6 w-10 rounded-full transition-colors ${
          on ? 'bg-primary' : 'bg-elevated'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

// ── Αναζήτηση & πρόσθεσε φίλο ──────────────────────────────────────────────────

function AddFriend({
  onAdd,
}: {
  onAdd: (u: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [results, setResults] = useState<import('@/lib/api/types').SocialSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = username.trim().toLowerCase();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .socialSearch(query)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    const res = await onAdd(username);
    setBusy(false);
    if (res.ok) {
      setUsername('');
      setResults([]);
      setMsg({ ok: true, text: t('social.add.sent') });
    } else {
      setMsg({
        ok: false,
        text: t(`social.add.err.${res.error}`, { defaultValue: t('social.add.err.generic') }),
      });
    }
  };

  const addFromResult = async (row: import('@/lib/api/types').SocialSearchResult) => {
    setBusy(true);
    setMsg(null);
    const res = await onAdd(row.username);
    setBusy(false);
    if (res.ok) {
      setResults((prev) =>
        prev.map((r) => (r.username === row.username ? { ...r, friendship: 'out' } : r)),
      );
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
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('social.add.title')}
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('social.add.placeholder')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={busy || username.trim().length < 3}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </form>

      {searching && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {t('social.add.searching')}
        </p>
      )}
      {!searching && username.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{t('social.add.noResults')}</p>
      )}
      {results.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {results.map((row) => (
            <li
              key={row.username}
              className="flex items-center gap-2 rounded-lg bg-elevated px-2 py-2"
            >
              <Avatar name={row.display_name || `@${row.username}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.display_name || `@${row.username}`}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  @{row.username} · {t(`gami.tier.${row.tier}`)} · {t('social.board.level')}{' '}
                  {row.level}
                </p>
              </div>
              {row.friendship === null ? (
                <Button size="sm" disabled={busy} onClick={() => void addFromResult(row)}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {row.friendship === 'friend' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : row.friendship === 'in' ? (
                    <Inbox className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {t(
                    row.friendship === 'friend'
                      ? 'social.add.friends'
                      : row.friendship === 'in'
                        ? 'social.add.incoming'
                        : 'social.add.requested',
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

// ── Συνδέσεις: φίλοι / εισερχόμενα / εξερχόμενα ────────────────────────────────

function Connections({
  friends,
  requests,
  onAccept,
  onRemove,
}: {
  friends: FriendRow[];
  requests: FriendRow[];
  onAccept: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'friends' | 'in' | 'out'>('friends');
  const incoming = requests.filter((r) => r.direction === 'in');
  const outgoing = requests.filter((r) => r.direction === 'out');
  const counts = { friends: friends.length, in: incoming.length, out: outgoing.length };
  const rows = tab === 'friends' ? friends : tab === 'in' ? incoming : outgoing;
  const empty = {
    friends: t('social.connections.emptyFriends'),
    in: t('social.connections.emptyIncoming'),
    out: t('social.connections.emptySent'),
  }[tab];

  return (
    <section className="rounded-xl bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('social.connections.title')}
      </p>
      <div className="mb-3 flex rounded-lg bg-elevated p-0.5 text-xs">
        {(['friends', 'in', 'out'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium transition-colors ${
              tab === key ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
            }`}
          >
            {key === 'friends' ? (
              <Users className="h-3.5 w-3.5" />
            ) : key === 'in' ? (
              <Inbox className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {t(
              key === 'friends'
                ? 'social.connections.friends'
                : key === 'in'
                  ? 'social.connections.incoming'
                  : 'social.connections.sent',
            )}
            {counts[key] > 0 && <span className="tabular-nums">· {counts[key]}</span>}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.account_id} className="flex items-center justify-between gap-2">
              <NameCell row={r} />
              <div className="flex shrink-0 gap-1.5">
                {tab === 'in' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void onAccept(r.account_id)}
                      aria-label={t('social.connections.accept')}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onRemove(r.account_id)}
                      aria-label={t('social.connections.decline')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {tab === 'out' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onRemove(r.account_id)}
                    aria-label={t('social.connections.cancel')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {tab === 'friends' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onRemove(r.account_id)}
                    aria-label={t('social.connections.remove')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Πίνακας κατάταξης ───────────────────────────────────────────────────────────

function Leaderboard({
  rows,
  scope,
  onScope,
  period,
  onPeriod,
  loading,
}: {
  rows: LeaderboardRow[];
  scope: LeaderboardScope;
  onScope: (s: LeaderboardScope) => void;
  period: LeaderboardPeriod;
  onPeriod: (p: LeaderboardPeriod) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const xpOf = (row: LeaderboardRow) => (period === 'week' ? (row.week_xp ?? 0) : row.xp);
  const top = rows.slice(0, 3).map((row, i) => ({ row, rank: i + 1 }));
  const podium: ({ row: LeaderboardRow; rank: number } | null)[] = [
    top[1] ?? null,
    top[0] ?? null,
    top[2] ?? null,
  ];
  const selfIndex = rows.findIndex((r) => r.is_self);
  const selfRank = selfIndex + 1;
  const rest = rows.slice(3);

  return (
    <section className="rounded-xl bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('social.board.title')}
      </p>
      <div className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex rounded-lg bg-elevated p-0.5 text-xs">
          <ScopeTab active={period === 'all'} onClick={() => onPeriod('all')}>
            {t('social.board.allTime')}
          </ScopeTab>
          <ScopeTab active={period === 'week'} onClick={() => onPeriod('week')}>
            {t('social.board.week')}
          </ScopeTab>
        </div>
      </div>
      {rows.length === 0 ? (
        loading ? (
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-elevated" />
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-muted-foreground">
            {t('social.board.empty')}
          </p>
        )
      ) : (
        <>
          <div className="grid grid-cols-3 items-end gap-1.5 pt-1">
            {podium.map((entry, i) =>
              entry ? (
                <PodiumEntry
                  key={`${entry.row.username ?? 'anon'}-${entry.rank}`}
                  row={entry.row}
                  rank={entry.rank}
                  xp={xpOf(entry.row)}
                />
              ) : (
                <div key={`empty-${i}`} />
              ),
            )}
          </div>
          {selfIndex >= 0 &&
            selfRank > 1 &&
            xpOf(rows[selfRank - 2]!) > xpOf(rows[selfIndex]!) && (
              <p className="mt-3 text-center text-xs text-[hsl(var(--gold))] tabular-nums">
                {t('social.board.behind', {
                  xp: (xpOf(rows[selfRank - 2]!) - xpOf(rows[selfIndex]!)).toLocaleString(),
                  rank: selfRank - 1,
                })}
              </p>
            )}
          {rest.length > 0 && (
            <ol className="mt-3 space-y-1" start={4}>
              {rest.map((r, i) => (
                <li
                  key={`${r.username ?? 'anon'}-${i + 4}`}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${
                    r.is_self ? 'bg-elevated' : ''
                  }`}
                >
                  <span className="w-6 text-center font-mono text-sm tabular-nums text-muted-foreground">
                    {i + 4}
                  </span>
                  <Avatar name={leaderboardName(r, t('social.anon'))} self={r.is_self} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <LeaderboardName row={r} />
                      {r.is_self && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {t('social.board.you')}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t(`gami.tier.${r.tier}`)}</span>
                      <Flair streakDays={r.streak_days} badges={r.badges} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm font-semibold tabular-nums">
                      {t('social.board.level')} {r.level}
                    </p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {xpOf(r).toLocaleString()} XP
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function PodiumEntry({
  row,
  rank,
  xp,
}: {
  row: LeaderboardRow;
  rank: number;
  xp: number;
}) {
  const { t } = useTranslation();
  const barHeight = rank === 1 ? 'h-20' : rank === 2 ? 'h-16' : 'h-14';
  return (
    <div className="flex min-w-0 flex-col items-center">
      <Avatar
        name={leaderboardName(row, t('social.anon'))}
        self={row.is_self}
        highlight={rank === 1}
        size="lg"
      />
      <p className="mt-2 w-full truncate text-center text-xs font-medium">
        <LeaderboardName row={row} />
        {row.is_self && (
          <span className="ml-1 text-[10px] text-muted-foreground">{t('social.board.you')}</span>
        )}
      </p>
      <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {xp.toLocaleString()} XP
      </p>
      <div
        className={`mt-2 flex w-full flex-col items-center justify-center rounded-t-lg ${barHeight} ${
          rank === 1 ? 'bg-[hsl(var(--gold)/0.12)]' : 'bg-elevated'
        }`}
      >
        <span className="font-display text-xl font-semibold tabular-nums">{rank}</span>
        <span className="text-[10px] text-muted-foreground">
          {t('social.board.level')} {row.level}
        </span>
      </div>
    </div>
  );
}

function LeaderboardName({ row }: { row: LeaderboardRow }) {
  const { t } = useTranslation();
  const label = leaderboardName(row, t('social.anon'));
  return row.username ? (
    <Link to={`/u/${row.username}`} className="hover:underline">
      {label}
    </Link>
  ) : (
    <>{label}</>
  );
}

function leaderboardName(
  row: { username: string | null; display_name: string | null },
  anon: string,
) {
  return row.display_name || (row.username ? `@${row.username}` : anon);
}

function Avatar({
  name,
  self = false,
  highlight = false,
  size = 'sm',
}: {
  name: string;
  self?: boolean;
  highlight?: boolean;
  size?: 'sm' | 'lg';
}) {
  const initials = name
    .replace(/^@/, '')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const dims = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-[10px]';
  const tone = highlight
    ? 'bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]'
    : self
      ? 'bg-elevated text-foreground ring-1 ring-[hsl(var(--gold)/0.45)]'
      : 'bg-elevated text-muted-foreground';
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-display font-semibold ${dims} ${tone}`}
    >
      {initials || '?'}
    </span>
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
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
        active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function NameCell({ row }: { row: FriendRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Mountain className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {row.username ? (
            <Link to={`/u/${row.username}`} className="hover:underline">
              {row.display_name || `@${row.username}`}
            </Link>
          ) : (
            row.display_name || t('social.anon')
          )}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
