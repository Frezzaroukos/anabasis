// Ελάχιστες δηλώσεις για το node:fs / node:path που χρειάζεται ΜΟΝΟ το
// src/lib/contrast.test.ts (διαβάζει το globals.css ως πηγή αλήθειας). Το app
// tsconfig δεν συμπεριλαμβάνει @types/node σκόπιμα — δεν το φορτώνουμε global
// μόνο για ένα test.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:path' {
  export function resolve(...segments: string[]): string;
}

// Το `process` υπάρχει σε runtime (vitest/node) αλλά χωρίς @types/node δεν είναι
// δηλωμένο — μόνο το cwd() χρειαζόμαστε εδώ.
declare const process: { cwd(): string };
