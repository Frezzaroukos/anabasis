import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { OfflineBanner } from './OfflineBanner';

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

afterEach(() => {
  setOnline(true);
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

describe('OfflineBanner', () => {
  it('δεν δείχνει τίποτα όταν είμαστε online', () => {
    setOnline(true);
    render(wrap(<OfflineBanner />));
    expect(screen.queryByText(en.common.offline)).toBeNull();
  });

  it('εμφανίζεται όταν ο browser πέσει offline', () => {
    render(wrap(<OfflineBanner />));
    setOnline(false);
    expect(screen.getByText(en.common.offline)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('εξαφανίζεται ξανά μόλις επανέλθει το δίκτυο', () => {
    render(wrap(<OfflineBanner />));
    setOnline(false);
    expect(screen.getByText(en.common.offline)).toBeTruthy();
    setOnline(true);
    expect(screen.queryByText(en.common.offline)).toBeNull();
  });
});
