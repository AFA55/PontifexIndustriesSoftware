'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default is ALWAYS light. Dark mode is explicit opt-in via the toggle,
  // persisted to localStorage. We intentionally do NOT follow the OS
  // `prefers-color-scheme` media query — the user wants the app to open
  // light for first-time visitors regardless of their system theme.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // One-time factory reset: older builds auto-followed OS `prefers-color-scheme`
    // and may have persisted `theme=dark` for users who never opted in. Bump a
    // reset sentinel so every client lands on light the next time they load,
    // then only honor subsequent explicit toggles.
    let saved: Theme | null = null;
    try {
      const resetDone = localStorage.getItem('theme.factory-reset') === 'v1';
      if (!resetDone) {
        localStorage.removeItem('theme');
        localStorage.setItem('theme.factory-reset', 'v1');
      }
      saved = localStorage.getItem('theme') as Theme | null;
    } catch {
      // localStorage unavailable (private browsing) — stay on light
    }
    if (saved === 'dark') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try { localStorage.setItem('theme', newTheme); } catch { /* private browsing */ }
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  // NOTE: we always mount the Provider, even before the client-side
  // mounted effect runs. This is required so that `useTheme()` works
  // during SSR / static prerender (the hook throws if no Provider is
  // in the tree). The theme state itself is initialized to 'light' and
  // will be corrected on mount from localStorage.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
