/**
 * Ημερομηνία για ονόματα export — ΤΟΠΙΚΗ, όχι UTC.
 *
 * Το `new Date().toISOString().slice(0, 10)` είναι η UTC μέρα: μεταξύ 00:00
 * και 02:00/03:00 τοπική (Αθήνα) το backup έπαιρνε τη χθεσινή ημερομηνία
 * (audit #18). Το `localDay` χρησιμοποιείται ήδη από το ημερολόγιο/CSV.
 */
import { localDay } from '@/lib/db/queries';

export function exportFileDate(date: Date = new Date()): string {
  return localDay(date);
}
