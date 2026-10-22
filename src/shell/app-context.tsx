// src/shell/app-context.tsx: the providers. AppProvider holds the whole app's state (src/shell/app-state.ts) and hands it
// to the Shell and the screens through useApp().
import type { ReactNode } from 'react';
import { AppContext, useAppState } from './app-state';

export function AppProvider({ children }: { children: ReactNode }) {
  return <AppContext.Provider value={useAppState()}>{children}</AppContext.Provider>;
}
