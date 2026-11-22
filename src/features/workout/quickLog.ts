/**
 * Quick-log parser: καταγραφή ολόκληρης άσκησης σε ΜΙΑ γραμμή, όπως στο
 * σημειωματάριο/Notion, αντί για tap-ανά-σετ.
 *
 * Υποστηρίζει όλη τη φυσική σημειογραφία προπόνησης:
 *   «80 5,4,3,2»                     → 80(unit) × 5, 4, 3, 2
 *   «80 5+4+3»                       → 80(unit) × 5, 4, 3
 *   «80kg 1 + 90kg 1 + 100kg 1»      → πολλαπλά βάρη σε μία γραμμή
 *   «30kg 5+4+3(drop set 10kg 7)»    → drop set δεμένο με το προηγούμενο σετ
 *   «60kg 9 + 70kg 8(50kg 9)»        → σύντομο παρενθετικό drop set
 *   «26kg 2,5+1(drop set 18kg 10)»   → μισές επαναλήψεις (2.5) + drop set
 *   «18kg 4xmax» / «80kg 3x5»        → πολλαπλασιαστής σετ (AMRAP / reps)
 *   «80x5»                           → ένα σετ 80 × 5
 *   «5,4,3» / «2+1+1+1» / «bw 5+4»   → bodyweight σετ χωρίς πρόσθετο βάρος
 *   «84,4 5»                         → δεκαδικό βάρος 84.4 × 5
 */

import type { SetType, WeightUnit } from '@/lib/db/types';
import { parseWeightToKg } from '@/lib/units';

export interface QuickSet {
  weightKg: number | null;
  reps: number | null;
  setType?: SetType;
  /** Κοινό νούμερο που συνδέει το κύριο σετ με τα drop sets που ακολουθούν. */
  dropGroup?: number;
  notes?: string | null;
}

const MAX_MULTIPLIER_SETS = 30;

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface ParsedRepToken {
  reps: number | null;
  setType?: SetType;
  notes?: string | null;
}

function unitToKg(value: number, explicitUnit: string | null, defaultUnit: WeightUnit): number {
  const effectiveUnit: WeightUnit =
    explicitUnit === 'lb' || explicitUnit === 'lbs'
      ? 'lb'
      : explicitUnit === 'kg'
        ? 'kg'
        : defaultUnit;
  return parseWeightToKg(value, effectiveUnit);
}

function parseRepTokens(raw: string): ParsedRepToken[] {
  let s = raw.trim().toLowerCase();
  if (!s) return [];
  // Strip leading separator noise (e.g. ": 5+4", "x 6", "- 5").
  s = s.replace(/^[:;×x\-–—]+\s*/, '').trim();
  if (!s) return [];

  // Normalize "4 x max" / "3 × 8" into compact "4xmax" / "3x8" tokens.
  s = s.replace(/\b(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?|max|amrap)\b/g, '$1x$2');

  // When `+` is used as set separator (e.g. "2,5+1"), comma inside digits is a decimal comma.
  const plusMode = s.includes('+');
  if (plusMode) {
    s = s.replace(/(\d),(\d)/g, '$1.$2');
  }

  const tokens = s
    .replace(/\+/g, ' ')
    .split(plusMode ? /\s+/ : /[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: ParsedRepToken[] = [];
  for (const tok of tokens) {
    const multMax = tok.match(/^(\d+)x(max|amrap)$/);
    if (multMax) {
      const count = Math.min(MAX_MULTIPLIER_SETS, Number(multMax[1]));
      for (let i = 0; i < count; i++) {
        out.push({ reps: null, setType: 'amrap', notes: 'max' });
      }
      continue;
    }

    const multNum = tok.match(/^(\d+)x(\d+(?:[.,]\d+)?)$/);
    if (multNum) {
      const count = Math.min(MAX_MULTIPLIER_SETS, Number(multNum[1]));
      const reps = round2(Number(multNum[2]!.replace(',', '.')));
      if (Number.isFinite(reps) && reps > 0) {
        for (let i = 0; i < count; i++) out.push({ reps });
      }
      continue;
    }

    if (tok === 'max' || tok === 'amrap') {
      out.push({ reps: null, setType: 'amrap', notes: 'max' });
      continue;
    }

    const n = Number(tok);
    if (Number.isFinite(n) && n > 0) {
      out.push({ reps: round2(n) });
    }
  }
  return out;
}

function makeSet(weightKg: number | null, tok: ParsedRepToken): QuickSet {
  const set: QuickSet = { weightKg, reps: tok.reps };
  if (tok.setType) set.setType = tok.setType;
  if (tok.notes) set.notes = tok.notes;
  return set;
}

// Το \b της JS δεν βλέπει τα ελληνικά ως γράμματα — lookahead αντί για \b.
const EXPLICIT_WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*(kgs?|lbs?|κιλ[αάόο]?|kilos?)(?![\p{L}\d])/giu;

function normalizeExplicitUnit(u: string): 'kg' | 'lb' {
  return u.toLowerCase().startsWith('lb') ? 'lb' : 'kg';
}

function parsePlainChunk(chunk: string, weighted: boolean, unit: WeightUnit): QuickSet[] {
  const raw = chunk.trim();
  if (!raw) return [];

  // Explicit "bw ..." prefix forces bodyweight mode for this chunk.
  const bwMatch = raw.match(/^(?:bw|bodyweight)\b[:\s-]*(.*)$/i);
  if (bwMatch) {
    return parseRepTokens(bwMatch[1] ?? '').map((tok) => makeSet(null, tok));
  }

  // Detect explicit weight markers like "80kg 1 + 90kg 1 + 100kg 1 + 80kg 6" or "18kg 4xmax".
  const matches = [...raw.matchAll(EXPLICIT_WEIGHT_RE)];
  // «3x15 20kg»: τα reps γράφτηκαν ΠΡΙΝ το βάρος (ένα βάρος, τίποτα μετά).
  if (matches.length === 1) {
    const m = matches[0]!;
    const before = raw.slice(0, m.index ?? 0).trim();
    const after = raw.slice((m.index ?? 0) + m[0].length).trim();
    if (before && !after) {
      const weightVal = Number(m[1]!.replace(',', '.'));
      const reps = parseRepTokens(before);
      if (Number.isFinite(weightVal) && weightVal >= 0 && reps.length > 0) {
        const wKg = unitToKg(weightVal, normalizeExplicitUnit(m[2]!), unit);
        return reps.map((tok) => makeSet(wKg, tok));
      }
    }
  }
  if (matches.length > 0) {
    const out: QuickSet[] = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]!;
      const weightVal = Number(m[1]!.replace(',', '.'));
      if (!Number.isFinite(weightVal) || weightVal < 0) continue;
      const wKg = unitToKg(weightVal, normalizeExplicitUnit(m[2]!), unit);
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? raw.length) : raw.length;
      // Strip trailing connectors between segments (e.g. "1 + " before "90kg").
      const repSlice = raw.slice(start, end).replace(/[\s+,;]+$/, '');
      const reps = parseRepTokens(repSlice);
      for (const tok of reps) out.push(makeSet(wKg, tok));
    }
    return out;
  }

  // No explicit kg/lb unit written.
  const lower = raw.toLowerCase();

  // «100x3x2» = βάρος × reps × σετ.
  const wxrxs = lower.match(/^(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+)$/);
  if (wxrxs && weighted) {
    const wVal = Number(wxrxs[1]!.replace(',', '.'));
    const reps = round2(Number(wxrxs[2]));
    const count = Math.min(MAX_MULTIPLIER_SETS, Number(wxrxs[3]));
    if (wVal > 0 && reps > 0 && count > 0) {
      return Array.from({ length: count }, () => makeSet(parseWeightToKg(wVal, unit), { reps }));
    }
  }

  // Single-token "80x5" in weighted mode → 80(unit) × 5 (backward-compatible).
  const compactWeightReps = lower.match(/^(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?|max|amrap)$/);
  // «3x8»/«4x10» χωρίς μονάδα: ακέραιο ≤6 μπροστά από το «x» είναι ο ΑΡΙΘΜΟΣ ΣΕΤ
  // (ποιος σηκώνει 4kg;), όχι βάρος — πέφτει παρακάτω στον πολλαπλασιαστή σετ.
  const aSmallSetCount =
    compactWeightReps != null && /^[1-6]$/.test(compactWeightReps[1]!) && compactWeightReps[2] !== undefined;
  if (compactWeightReps && weighted && !aSmallSetCount) {
    const wVal = Number(compactWeightReps[1]!.replace(',', '.'));
    if (Number.isFinite(wVal) && wVal > 0) {
      const wKg = parseWeightToKg(wVal, unit);
      const repToks = parseRepTokens(compactWeightReps[2]!);
      return repToks.map((tok) => makeSet(wKg, tok));
    }
  }

  // «3x8» σε weighted mode: πολλαπλασιαστής σετ χωρίς βάρος (bodyweight σετ).
  if (aSmallSetCount) {
    const reps = parseRepTokens(lower);
    if (reps.length > 0) return reps.map((tok) => makeSet(null, tok));
  }

  // Whitespace separates weight from reps when weighted (e.g. "80 5,4,3,2", "84,4 5", "80 3x5").
  const firstSpace = lower.search(/\s/);
  if (firstSpace !== -1 && weighted) {
    const weightRaw = lower.slice(0, firstSpace).replace(',', '.');
    const weight = Number(weightRaw);
    const reps = parseRepTokens(lower.slice(firstSpace + 1));
    if (!Number.isFinite(weight) || weight <= 0 || reps.length === 0) return [];
    const weightKg = parseWeightToKg(weight, unit);
    return reps.map((tok) => makeSet(weightKg, tok));
  }

  // Single decimal weight with comma and no reps ("84,4") in weighted mode → invalid.
  if (weighted && /^\d+,\d+$/.test(lower)) return [];

  // Single bare number in weighted mode ("80") → weight without reps → invalid.
  if (weighted && /^\d+(?:\.\d+)?$/.test(lower)) return [];

  // Bodyweight mode or list of reps ("5,4,3", "2+1+1+1", "4xmax", "3x10", "84,4").
  const reps = parseRepTokens(lower);
  if (reps.length === 0) return [];
  // In weighted mode, a bare single token without separator (unless max/multiplier) is ambiguous.
  if (weighted && reps.length === 1 && !/[,+x×]/.test(lower) && reps[0]!.reps != null) return [];
  return reps.map((tok) => makeSet(null, tok));
}

export function parseQuickSets(
  input: string,
  weighted: boolean,
  unit: WeightUnit = 'kg',
): QuickSet[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Split into normal chunks and parenthetical drop-set chunks: e.g.
  // "30kg 5+4+3(drop set 10kg 7)" → normal("30kg 5+4+3"), paren("drop set 10kg 7")
  const parts: Array<{ isDrop: boolean; text: string }> = [];
  const parenRe = /\(([^()]*)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = parenRe.exec(trimmed)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ isDrop: false, text: trimmed.slice(lastIndex, match.index) });
    }
    parts.push({ isDrop: true, text: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < trimmed.length) {
    parts.push({ isDrop: false, text: trimmed.slice(lastIndex) });
  }

  const out: QuickSet[] = [];
  let nextDropGroup = 1;

  for (const part of parts) {
    if (!part.isDrop) {
      const parsed = parsePlainChunk(part.text, weighted, unit);
      out.push(...parsed);
      continue;
    }

    // Strip optional "drop set" / "dropset" / "drop" / "ds" prefix inside parentheses.
    const inner = part.text
      .trim()
      .replace(/^(?:drop\s*sets?|dropsets?|drop|ds)\b[:\s-]*/i, '')
      .trim();
    const dropSets = parsePlainChunk(inner, true, unit);
    if (dropSets.length === 0) continue;

    const prev = out[out.length - 1];
    const group = prev?.dropGroup ?? nextDropGroup++;
    if (prev && prev.dropGroup == null) {
      prev.dropGroup = group;
    }
    for (const ds of dropSets) {
      out.push({
        ...ds,
        setType: ds.setType ?? 'dropset',
        dropGroup: group,
      });
    }
  }

  return out;
}
