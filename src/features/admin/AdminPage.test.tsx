import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { api, type AdminStats, type AdminUser } from '@/lib/api/client';
import { AdminPage } from './AdminPage';

vi.mock('@/lib/api/auth', () => ({
  useAuth: () => ({
    token: 'token',
    account: { id: 'admin-1', email: 'me@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z' },
  }),
}));

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

const STATS: AdminStats = {
  accounts: 2,
  active_accounts: 2,
  disabled_accounts: 0,
  admins: 1,
  sessions: 3,
  rows: 1200,
  db_size_bytes: 5 * 1024 * 1024,
  uptime_seconds: 3600,
};

const USERS: AdminUser[] = [
  {
    id: 'admin-1',
    email: 'me@example.com',
    role: 'admin',
    disabled: false,
    created_at: '2026-01-01T00:00:00Z',
    last_sync_at: '2026-02-01T10:00:00Z',
    row_count: 900,
    sessions: 2,
  },
  {
    id: 'u-2',
    email: 'friend@proton.me',
    role: 'user',
    disabled: false,
    created_at: '2026-01-05T00:00:00Z',
    last_sync_at: null,
    row_count: 300,
    sessions: 1,
  },
];

function renderPage() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function stub(users: AdminUser[], stats: AdminStats = STATS) {
  vi.spyOn(api, 'adminListUsers').mockResolvedValue(users);
  vi.spyOn(api, 'adminStats').mockResolvedValue(stats);
}

/**
 * Ο πυρήνας του μετώπου: η σελίδα έκανε `{(users ?? []).map(...)}` — όσο
 * φόρτωνε ΚΑΙ όταν αποτύγχανε έδειχνε το ίδιο πράγμα, δηλαδή τίποτα. Ο admin
 * δεν μπορούσε να ξεχωρίσει «περίμενε» από «δεν υπάρχει κανείς» από «χάλασε».
 */
describe('AdminPage — καταστάσεις φόρτωσης', () => {
  it('όσο φορτώνει ΔΕΝ ισχυρίζεται ότι δεν υπάρχουν λογαριασμοί', () => {
    vi.spyOn(api, 'adminListUsers').mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, 'adminStats').mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByText('No accounts yet.')).toBeNull();
    expect(screen.queryByText('me@example.com')).toBeNull();
  });

  it('σε σφάλμα δείχνει μήνυμα ΚΑΙ κουμπί επανάληψης που ξαναφορτώνει', async () => {
    const list = vi.spyOn(api, 'adminListUsers').mockRejectedValue(new Error('boom'));
    vi.spyOn(api, 'adminStats').mockRejectedValue(new Error('boom'));
    renderPage();

    await screen.findByText("Couldn't load admin data.");
    list.mockResolvedValue(USERS);
    vi.spyOn(api, 'adminStats').mockResolvedValue(STATS);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('friend@proton.me')).toBeTruthy();
  });

  it('με μηδέν λογαριασμούς το λέει ρητά', async () => {
    stub([], { ...STATS, accounts: 0, active_accounts: 0, admins: 0, sessions: 0, rows: 0 });
    renderPage();
    expect(await screen.findByText('No accounts yet.')).toBeTruthy();
  });
});

describe('AdminPage — αναζήτηση & φίλτρα', () => {
  it('δείχνει πόσα από πόσα και στενεύει με την αναζήτηση', async () => {
    stub(USERS);
    renderPage();

    expect(await screen.findByText('2 of 2')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by email' }), {
      target: { value: 'proton' },
    });
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());
    expect(screen.queryByText('me@example.com')).toBeNull();
  });

  it('χωρίς αποτελέσματα προσφέρει καθαρισμό φίλτρων — όχι κενή οθόνη', async () => {
    stub(USERS);
    renderPage();
    await screen.findByText('2 of 2');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by email' }), {
      target: { value: 'nobody' },
    });
    expect(await screen.findByText('No account matches this search.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('me@example.com')).toBeTruthy();
  });

  it('το φίλτρο «Admins» κρατά μόνο τους διαχειριστές', async () => {
    stub(USERS);
    renderPage();
    await screen.findByText('2 of 2');

    fireEvent.click(screen.getByRole('button', { name: 'Admins' }));
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());
    expect(screen.queryByText('friend@proton.me')).toBeNull();
  });
});

describe('AdminPage — ενέργειες', () => {
  it('δεν προσφέρει «Disable» στον ίδιο σου τον λογαριασμό (ο server το απορρίπτει)', async () => {
    stub(USERS);
    renderPage();
    await screen.findByText('me@example.com');
    // Ένα μόνο κουμπί Disable: του άλλου χρήστη, όχι του δικού μου.
    expect(screen.getAllByRole('button', { name: 'Disable' })).toHaveLength(1);
  });

  it('δείχνει τον προσωρινό κωδικό με προειδοποίηση μιας χρήσης', async () => {
    stub(USERS);
    vi.spyOn(api, 'adminResetPassword').mockResolvedValue({ temp_password: 'temp-abc123' });
    renderPage();
    await screen.findByText('friend@proton.me');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('temp-abc123')).toBeTruthy();
    expect(screen.getByText(/Shown once/)).toBeTruthy();
  });

  it('το μέγεθος βάσης «—» όταν ο server δεν μπορεί να το διαβάσει', async () => {
    stub(USERS, { ...STATS, db_size_bytes: null });
    renderPage();
    await screen.findByText('me@example.com');
    // 5.0 MB θα φαινόταν αν το κρύβαμε πίσω από ψεύτικο μηδέν.
    expect(screen.queryByText('5.0 MB')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
