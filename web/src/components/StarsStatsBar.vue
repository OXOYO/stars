<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStarsStore, requestStarsRowRemeasure } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';
import { useMobileSheetInset } from '../composables/useMobileSheetInset';
import { MOBILE_MEDIA } from '../composables/useMediaQuery';
import StarsStatsCharts from './StarsStatsCharts.vue';

const STATS_EXPANDED_KEY = 'stars-stats-expanded';

const props = defineProps({
  isMobile: { type: Boolean, default: false },
});

function readStatsExpanded() {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const v = sessionStorage.getItem(STATS_EXPANDED_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

const store = useStarsStore();
const { t } = useStarsI18n();
const expanded = ref(readStatsExpanded());

const stats = computed(() => store.stats);
const showOverlay = computed(() => store.hasActiveFilters);

const statsSheetOpen = computed(() => props.isMobile && expanded.value && Boolean(stats.value));
useMobileSheetInset(statsSheetOpen);

watch(
  () => props.isMobile,
  (mobile) => {
    if (mobile && expanded.value) {
      try {
        if (sessionStorage.getItem(STATS_EXPANDED_KEY) !== '1') expanded.value = false;
      } catch {
        expanded.value = false;
      }
    }
  }
);

watch(
  () => props.isMobile && expanded.value,
  (sheetOpen) => {
    if (!props.isMobile) return;
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
  }
);

function onKeydown(e) {
  if (e.key === 'Escape' && props.isMobile && expanded.value) {
    void closeSheet();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  if (props.isMobile) document.body.style.overflow = '';
});

async function closeSheet() {
  if (!expanded.value) return;
  expanded.value = false;
  try {
    sessionStorage.setItem(STATS_EXPANDED_KEY, '0');
  } catch {
    /* ignore */
  }
  await nextTick();
  requestStarsRowRemeasure();
}

async function toggleExpanded() {
  expanded.value = !expanded.value;
  try {
    sessionStorage.setItem(STATS_EXPANDED_KEY, expanded.value ? '1' : '0');
  } catch {
    /* ignore */
  }
  await nextTick();
  requestStarsRowRemeasure();
}
</script>

<template>
  <Teleport v-if="props.isMobile && expanded && stats" to="body">
    <div class="stars-mobile-sheet is-open" role="presentation">
      <button
        type="button"
        class="stars-mobile-sheet__backdrop"
        :aria-label="t('statPanelCollapse')"
        tabindex="-1"
        @click="closeSheet"
      />
      <div
        class="stars-mobile-sheet__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('statPanelTitle')"
      >
        <header class="stars-mobile-sheet__header">
          <h2 class="stars-mobile-sheet__title">{{ t('statPanelTitle') }}</h2>
          <button
            type="button"
            class="stars-mobile-sheet__close"
            :aria-label="t('statPanelCollapse')"
            @click="closeSheet"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 1 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 1 1-1.275.326.749.749 0 0 1 .215-.734L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
              />
            </svg>
          </button>
        </header>
        <div class="stars-mobile-sheet__body stars-mobile-sheet__body--stats">
          <StarsStatsCharts />
        </div>
      </div>
    </div>
  </Teleport>

  <section
    v-if="stats"
    class="stars-stats"
    :class="{
      'is-collapsed': !expanded || props.isMobile,
      'has-overlay': showOverlay,
      'stars-stats--mobile': props.isMobile,
    }"
    aria-label="Statistics"
  >
    <div class="stars-stats__header">
      <div class="stars-stats__totals">
        <span class="stars-stats__chip">{{ t('statTotal', { count: stats.totals.total.toLocaleString() }) }}</span>
        <span class="stars-stats__chip">{{ t('statLangs', { count: stats.totals.languages }) }}</span>
        <span class="stars-stats__chip">{{ t('statLicenses', { count: stats.totals.licenses }) }}</span>
      </div>
      <button
        type="button"
        class="stars-stats__toggle"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <svg
          class="stars-stats__toggle-icon"
          :class="{ 'is-expanded': expanded && !props.isMobile }"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M4.22 6.47 8 10.25l3.78-3.78 1.06 1.06L8 12.38 3.16 7.53l1.06-1.06z"
          />
        </svg>
        {{ expanded ? t('statPanelCollapse') : t('statPanelExpand') }}
      </button>
    </div>

    <StarsStatsCharts v-if="!props.isMobile && expanded" />
  </section>
</template>
