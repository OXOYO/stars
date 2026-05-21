import { computed } from 'vue';
import { createTranslator } from '../i18n';
import { useStarsStore } from './useStarsStore';

export function useStarsI18n() {
  const store = useStarsStore();
  const locale = computed(() => store.uiLocale);
  const t = computed(() => createTranslator(() => locale.value));
  const basePath = computed(() => {
    const b = import.meta.env.BASE_URL || '/';
    return b.endsWith('/') ? b : `${b}/`;
  });
  return { locale, t, basePath };
}
