import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import type { SetType } from '@/lib/db/types';
import { AddSetInline, type SetIntensity } from './AddSetInline';

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

const REPS_LABEL = en.workout.reps; // "Reps"
const HOLD_LABEL = en.workout.holdSeconds; // "Hold (sec)"
const SAVE = en.workout.addSet; // "Add set"

describe('AddSetInline — hold vs reps flow', () => {
  it('reps mode (default): δείχνει Reps, σώζει reps χωρίς hold', () => {
    const onSave = vi.fn<
      (w: number | null, r: number | null, h: number | null, i: SetIntensity) => void
    >();
    render(wrap(<AddSetInline weighted={false} onSave={onSave} />));

    expect(screen.getByLabelText(REPS_LABEL)).toBeTruthy();
    expect(screen.queryByLabelText(HOLD_LABEL)).toBeNull();

    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledWith(null, 8, null, expect.anything(), []);
  });

  it('holdMode: δείχνει Hold (sec), σώζει hold χωρίς reps', () => {
    const onSave = vi.fn();
    render(wrap(<AddSetInline weighted={false} holdMode onSave={onSave} />));

    expect(screen.getByLabelText(HOLD_LABEL)).toBeTruthy();
    expect(screen.queryByLabelText(REPS_LABEL)).toBeNull();

    fireEvent.change(screen.getByLabelText(HOLD_LABEL), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledWith(null, null, 30, expect.anything(), []);
  });

  it('set type isometric → hold field ακόμη κι όταν holdMode=false', () => {
    render(wrap(<AddSetInline weighted={false} setType="isometric" onSetTypeChange={() => {}} onSave={() => {}} />));
    expect(screen.getByLabelText(HOLD_LABEL)).toBeTruthy();
    expect(screen.queryByLabelText(REPS_LABEL)).toBeNull();
  });

  it('weighted: σώζει βάρος (kg) + reps', () => {
    const onSave = vi.fn();
    render(wrap(<AddSetInline weighted onSave={onSave} />));

    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledWith(40, 5, null, expect.anything(), []);
  });

  it('save disabled χωρίς reps', () => {
    render(wrap(<AddSetInline weighted={false} onSave={() => {}} />));
    expect(screen.getByRole('button', { name: SAVE })).toHaveProperty('disabled', true);
  });

  it('εναλλαγή σε hold type καθαρίζει stale reps (polish)', () => {
    function Controlled() {
      const [st, setSt] = useState<SetType>('normal');
      return <AddSetInline weighted={false} setType={st} onSetTypeChange={setSt} onSave={() => {}} />;
    }
    render(wrap(<Controlled />));

    // Γράψε reps, μετά διάλεξε isometric → εμφανίζεται hold, reps καθαρίζεται.
    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('radio', { name: en.setType.isometric }));

    expect(screen.getByLabelText(HOLD_LABEL)).toBeTruthy();
    expect(screen.queryByLabelText(REPS_LABEL)).toBeNull();

    // Πίσω σε normal → το Reps πεδίο είναι άδειο (δεν επέζησε το «8»).
    fireEvent.click(screen.getByRole('radio', { name: en.setType.normal }));
    expect(screen.getByLabelText(REPS_LABEL)).toHaveProperty('value', '');
  });

  it('rest-pause ζητά mini-sets και τα σώζει ως ένα parent set', () => {
    const onSave = vi.fn();
    render(
      wrap(
        <AddSetInline
          weighted={false}
          setType="rest_pause"
          onSetTypeChange={() => {}}
          onSave={onSave}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '8' } });
    const miniSets = screen.getByLabelText(en.workout.restPauseMiniSets);
    fireEvent.change(miniSets, { target: { value: '3, 2' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[1]).toBe(8);
    expect(onSave.mock.calls[0]?.[4]).toEqual([3, 2]);
  });
});
