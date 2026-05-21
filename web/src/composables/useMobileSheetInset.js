import { onUnmounted, watch } from 'vue';

/** 弹层顶部不得高于该线，避免挡住「当前筛选」等主区控件 */
export const MOBILE_SHEET_TOP_VAR = '--stars-mobile-sheet-top';

const CHROME_SELECTORS = [
  '.stars-active-filters',
  '.stars-stats--mobile',
  '.stars-mobile-toolbar',
];

const GAP_PX = 8;
const FALLBACK_TOP_PX = 112;

function measureSheetTopInset() {
  let bottom = 0;
  for (const selector of CHROME_SELECTORS) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const { bottom: b, height } = el.getBoundingClientRect();
    if (height > 0 && b > bottom) bottom = b;
  }
  const top = bottom > 0 ? bottom + GAP_PX : FALLBACK_TOP_PX;
  document.documentElement.style.setProperty(MOBILE_SHEET_TOP_VAR, `${Math.round(top)}px`);
}

function clearSheetTopInset() {
  document.documentElement.style.removeProperty(MOBILE_SHEET_TOP_VAR);
}

/**
 * @param {import('vue').Ref<boolean> | import('vue').ComputedRef<boolean> | (() => boolean)} openSource
 */
export function useMobileSheetInset(openSource) {
  /** @type {ResizeObserver | null} */
  let resizeObserver = null;

  function isOpen() {
    const v = typeof openSource === 'function' ? openSource() : openSource.value;
    return Boolean(v);
  }

  function onLayoutChange() {
    if (isOpen()) measureSheetTopInset();
  }

  function observeChrome() {
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(onLayoutChange);
    for (const selector of CHROME_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) resizeObserver.observe(el);
    }
  }

  function bindListeners() {
    window.addEventListener('resize', onLayoutChange);
    window.visualViewport?.addEventListener('resize', onLayoutChange);
    window.visualViewport?.addEventListener('scroll', onLayoutChange);
    observeChrome();
  }

  function unbindListeners() {
    window.removeEventListener('resize', onLayoutChange);
    window.visualViewport?.removeEventListener('resize', onLayoutChange);
    window.visualViewport?.removeEventListener('scroll', onLayoutChange);
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  watch(
    openSource,
    (open) => {
      unbindListeners();
      if (open) {
        requestAnimationFrame(() => {
          measureSheetTopInset();
          bindListeners();
        });
      } else {
        clearSheetTopInset();
      }
    },
    { flush: 'post' }
  );

  onUnmounted(() => {
    unbindListeners();
    clearSheetTopInset();
  });
}
