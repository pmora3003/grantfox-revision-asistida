export type ThemePref = 'claro' | 'oscuro' | 'sistema'

const STORAGE_KEY = 'grantfox-theme'

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'claro' || v === 'oscuro' || v === 'sistema') return v
  } catch {
    /* ignore */
  }
  return 'claro'
}

export function saveThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    /* ignore */
  }
}

export function resolvedTheme(pref: ThemePref): 'claro' | 'oscuro' {
  if (pref === 'claro') return 'claro'
  if (pref === 'oscuro') return 'oscuro'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'oscuro'
  }
  return 'claro'
}

export function applyTheme(pref: ThemePref) {
  const resolved = resolvedTheme(pref)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved === 'oscuro' ? 'dark' : 'light'
}
