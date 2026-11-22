/** Ένταση κελιού: 0 = καμία προπόνηση, 1 = μία, 2+ = πολλές την ίδια μέρα. */
export function heatLevel(sessions: number): 0 | 1 | 2 {
  return sessions <= 0 ? 0 : sessions === 1 ? 1 : 2;
}
