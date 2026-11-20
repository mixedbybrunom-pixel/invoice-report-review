import { HISTORY_LIMIT } from './rules';
import type { RunHistoryEntry } from './types';

const KEYS = {
  history: 'ccl-validator-history',
  lastSeenCount: 'cclMasterLastSeenAccountCount',
  theme: 'ccl-dark',
  colorTheme: 'ccl-color-theme',
  sidebarCollapsed: 'ccl-sidebar-collapsed',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable; the session keeps working without persistence
  }
}

export const loadHistory = () => read<RunHistoryEntry[]>(KEYS.history, []);
export function appendHistory(entry: RunHistoryEntry): RunHistoryEntry[] {
  const next = [entry, ...loadHistory()].slice(0, HISTORY_LIMIT);
  write(KEYS.history, next);
  return next;
}

export function loadLastSeenCount(): number | null {
  const raw = localStorage.getItem(KEYS.lastSeenCount);
  return raw === null ? null : Number(raw);
}
export const saveLastSeenCount = (count: number) => localStorage.setItem(KEYS.lastSeenCount, String(count));

export const loadTheme = (): boolean => localStorage.getItem(KEYS.theme) === '1';
export const saveTheme = (dark: boolean) => localStorage.setItem(KEYS.theme, dark ? '1' : '0');

export type ColorTheme = 'blue' | 'green';
export const loadColorTheme = (): ColorTheme => (localStorage.getItem(KEYS.colorTheme) === 'green' ? 'green' : 'blue');
export const saveColorTheme = (theme: ColorTheme) => localStorage.setItem(KEYS.colorTheme, theme);

export const loadCollapsedGroups = () => read<string[]>(KEYS.sidebarCollapsed, []);
export const saveCollapsedGroups = (titles: string[]) => write(KEYS.sidebarCollapsed, titles);
