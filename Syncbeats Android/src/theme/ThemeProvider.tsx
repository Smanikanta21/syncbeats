import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

// Values from the Swift client's DesignSystem/NativeTheme.swift.
const light = {
  background: '#F7F5EF', panel: '#FFFDF8', raised: '#EEECE4', text: '#272C28',
  secondary: '#5D665E', quiet: '#626C62', gold: '#856635', line: '#272C281A',
  ready: '#41653A', error: '#9C3D27', buttonText: '#FFFDF8',
};
const dark = {
  background: '#171C1A', panel: '#1C211F', raised: '#262C28', text: '#F4F5EF',
  secondary: '#B7BAB5', quiet: '#929B93', gold: '#CCB184', line: '#F4F5EF17',
  ready: '#A4BD9E', error: '#F3B7A3', buttonText: '#252920',
};
export type Palette = typeof light;
const ThemeContext = createContext<{ palette: Palette; isDark: boolean; toggle: () => void } | null>(null);
export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [override, setOverride] = useState<boolean | null>(null);
  const isDark = override ?? system === 'dark';
  const value = useMemo(() => ({ palette: isDark ? dark : light, isDark, toggle: () => setOverride(!isDark) }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is missing'); return value; }
