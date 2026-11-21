import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  it('accepts half/partial repetitions like 2.5 and rejects zero, negative, or >2-decimal reps', () => {
    const onSave = vi.fn();
    render(wrap(<AddSetInline weighted={false} onSave={onSave} />));

    // Negative cases: 0, negative, >2 decimals rejected
    for (const bad of ['0', '-1', '2.555']) {
      fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: bad } });
      fireEvent.keyDown(screen.getByLabelText(REPS_LABEL), { key: 'Enter' });
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: SAVE })).toHaveProperty('disabled', true);
    }

    // Positive case: 2.5 half-reps accepted
    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    expect(onSave).toHaveBeenCalledWith(null, 2.5, null, expect.anything(), []);
  });

  it('allows AMRAP sets without numeric reps and passes per-set notes through intensity', () => {
    const onSave = vi.fn();
    render(
      wrap(
        <AddSetInline
          weighted
          initialWeight={18}
          setType="amrap"
          onSetTypeChange={() => {}}
          onSave={onSave}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: en.workout.intensityShow }));
    fireEvent.change(screen.getByLabelText(en.workout.setNote), { target: { value: 'SAT rows' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    expect(onSave).toHaveBeenCalledWith(
      18,
      null,
      null,
      expect.objectContaining({ notes: 'SAT rows' }),
      [],
    );
  });

  it.each([['11', '0'], ['0', '0'], ['8', '-1'], ['8', '1.5']])('rejects invalid intensity RPE=%s, RIR=%s', (rpe, rir) => {
    const onSave = vi.fn();
    render(wrap(<AddSetInline weighted={false} initialReps={8} onSave={onSave} />));
    fireEvent.click(screen.getByRole('button', { name: en.workout.intensityShow }));
    fireEvent.change(screen.getByLabelText(en.workout.rpe), { target: { value: rpe } });
    fireEvent.change(screen.getByLabelText(en.workout.rir), { target: { value: rir } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects absurd magnitudes (stuck-zero typo) but accepts large-but-plausible loads', () => {
    const onSave = vi.fn();
    render(wrap(<AddSetInline weighted initialWeight={100} onSave={onSave} />));

    // 250 reps — σχεδόν σίγουρα κολλημένο μηδέν, απορρίπτεται
    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '2500' } });
    expect(screen.getByRole('button', { name: SAVE })).toHaveProperty('disabled', true);

    // 5000 kg — παράλογο, απορρίπτεται
    fireEvent.change(screen.getByLabelText(REPS_LABEL), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: '5000' } });
    expect(screen.getByRole('button', { name: SAVE })).toHaveProperty('disabled', true);

    // 300 kg × 5 — μεγάλο αλλά έγκυρο, περνά
    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: '300' } });
    expect(screen.getByRole('button', { name: SAVE })).toHaveProperty('disabled', false);
  });

  it('keeps values and announces failed writes, then allows an explicit retry', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('disk error')).mockResolvedValue(undefined);
    render(wrap(<AddSetInline weighted initialWeight={40} initialReps={8} onSave={onSave} />));
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(en.workout.saveFailed));
    expect(screen.getByLabelText(REPS_LABEL)).toHaveProperty('value', '8');
    expect(screen.getByLabelText(/Weight/)).toHaveProperty('value', '40');
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    await waitFor(() => expect(screen.getByLabelText(REPS_LABEL)).toHaveProperty('value', ''));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('serializes rapid keyboard saves until the first write finishes', async () => {
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(wrap(<AddSetInline weighted={false} initialReps={8} onSave={onSave} />));
    const input = screen.getByLabelText(REPS_LABEL);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(input.closest('fieldset')).toHaveProperty('disabled', true);
    await act(async () => resolve());
    expect(input.closest('fieldset')).toHaveProperty('disabled', false);
  });

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
