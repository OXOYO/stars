import { onMounted, onUnmounted, ref } from 'vue';

/**
 * @param {string} query 例如 '(max-width: 768px)'
 */
export function useMediaQuery(query) {
  const matches = ref(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  let mql;

  function update() {
    matches.value = !!mql?.matches;
  }

  onMounted(() => {
    mql = window.matchMedia(query);
    update();
    mql.addEventListener('change', update);
  });

  onUnmounted(() => {
    mql?.removeEventListener('change', update);
  });

  return matches;
}

export const MOBILE_MEDIA = '(max-width: 768px)';

/** 当前是否为移动端视口（与 MOBILE_MEDIA 一致） */
export function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MEDIA).matches;
}
