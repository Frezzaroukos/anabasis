import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { InviteButton } from './FriendsSection';

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>
);

describe('InviteButton', () => {
  it('copies the invite text when native share is unavailable', async () => {
    render(wrap(<InviteButton username="aggelos" />));

    fireEvent.click(screen.getByRole('button', { name: 'Invite friends' }));

    const url = `${window.location.origin}/u/aggelos`;
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`Add me on Anabasis — my profile: ${url}`),
    );
    expect(await screen.findByText('Invite copied')).toBeTruthy();
  });

  it('shows a scannable QR sheet and copies the profile link', async () => {
    render(wrap(<InviteButton username="aggelos" />));

    fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('Scan to add me').length).toBeGreaterThan(0);
    expect(document.querySelector('[role="dialog"] svg')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/u/aggelos`),
    );
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });
});
