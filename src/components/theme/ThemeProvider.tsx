"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "video-agent:theme";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * App-wide theme provider. Defaults to light; persists the choice to
 * localStorage and toggles the `dark` class on <html> so Tailwind's `dark:`
 * variants flip globally. A no-flash inline script in the root layout applies
 * the stored theme before hydration.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Read the persisted (or pre-applied) theme once on mount.
  useEffect(() => {
    const stored =
      (typeof window !== "undefined" &&
        (localStorage.getItem(STORAGE_KEY) as Theme | null)) ||
      (document.documentElement.classList.contains("dark") ? "dark" : "light");
    if (stored === "dark" || stored === "light") setThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
