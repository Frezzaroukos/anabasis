import { createContext, useContext } from 'react';

export const AppBootContext = createContext(false);

export function useAppBootReady(): boolean {
  return useContext(AppBootContext);
}
