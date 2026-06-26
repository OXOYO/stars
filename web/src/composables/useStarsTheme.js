import { onMounted, onUnmounted, ref } from 'vue';
import {
  applyColorTheme,
  persistColorThemePreference,
  readColorThemePreference,
  resolveColorTheme,
} from '../theme/color-theme';

export function useStarsTheme() {
  const preference = ref(readColorThemePreference());
  const resolvedTheme = ref(resolveColorTheme(preference.value));

  function syncTheme() {
    resolvedTheme.value = applyColorTheme(preference.value);
  }

  function setColorTheme(next) {
    const value = next === 'dark' ? 'dark' : 'light';
    preference.value = value;
    persistColorThemePreference(value);
    syncTheme();
  }

  let mediaQuery;
  let onMediaChange;

  onMounted(() => {
    syncTheme();
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    onMediaChange = () => {
      if (preference.value === 'system') syncTheme();
    };
    mediaQuery.addEventListener('change', onMediaChange);
  });

  onUnmounted(() => {
    if (mediaQuery && onMediaChange) {
      mediaQuery.removeEventListener('change', onMediaChange);
    }
  });

  return {
    preference,
    resolvedTheme,
    setColorTheme,
  };
}
