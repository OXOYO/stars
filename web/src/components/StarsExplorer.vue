<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStarsStore } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';
import StarsStatsBar from './StarsStatsBar.vue';
import StarsActiveFilters from './StarsActiveFilters.vue';
import StarsListPane from './StarsListPane.vue';
import StarsViewToggle from './StarsViewToggle.vue';
import StarsMobileToolbar from './StarsMobileToolbar.vue';

const StarsGalaxyView = defineAsyncComponent(() => import('./StarsGalaxyView.vue'));

defineProps({
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['open-filters']);

const store = useStarsStore();
const { t } = useStarsI18n();

const galaxyReady = ref(false);

const showGalaxy = computed(() => store.viewMode === 'galaxy' && store.filtered.length > 0);

function onGalaxySelect(item) {
  store.selectGalaxyItem(item);
}

function syncFocusSelection() {
  if (!store.galaxyFocus || store.galaxySelected) return;
  const found = store.filtered.find((item) => item.id === store.galaxyFocus);
  if (found) store.galaxySelected = found;
}

watch(
  () => store.viewMode,
  async (mode) => {
    if (mode !== 'galaxy') {
      galaxyReady.value = false;
      return;
    }
    await store.bootstrap();
    await store.ensureGalaxyLayout();
    galaxyReady.value = true;
  },
  { immediate: true }
);

watch(
  () => [store.filtered, store.galaxyFocus],
  () => syncFocusSelection(),
  { deep: false }
);

onMounted(async () => {
  await store.bootstrap();
  syncFocusSelection();
  window.addEventListener('popstate', store.onPopState);
});

onUnmounted(() => {
  window.removeEventListener('popstate', store.onPopState);
});
</script>

<template>
  <div
    class="stars-explorer"
    :class="{ 'stars-explorer--galaxy-mobile': isMobile && store.viewMode === 'galaxy' }"
  >
    <p v-if="store.loading" class="stars-explorer__status">{{ t('loading') }}</p>
    <p v-else-if="store.error" class="stars-explorer__status stars-explorer__status--error">
      {{ t('loadError', { error: store.error }) }}
    </p>
    <template v-else>
      <StarsMobileToolbar v-if="isMobile" @open-filters="emit('open-filters')" />
      <StarsStatsBar
        v-if="!isMobile || store.viewMode !== 'galaxy'"
        :is-mobile="isMobile"
      />
      <div
        class="stars-explorer__toolbar"
        :class="{ 'stars-explorer__toolbar--desktop-only': isMobile }"
      >
        <StarsActiveFilters v-if="store.hasActiveFilters" class="stars-explorer__toolbar-filters" />
        <p
          v-else
          class="stars-explorer__count"
          v-html="
            t('filterCount', {
              filtered: store.filtered.length.toLocaleString(),
              total: store.total.toLocaleString(),
            })
          "
        />
        <StarsViewToggle />
      </div>

      <div v-if="store.filtered.length === 0" class="stars-explorer__empty stars-explorer__empty--pane">
        <p>{{ t('empty') }}</p>
        <button type="button" class="stars-explorer__clear-btn" @click="store.clearAllFilters">
          {{ t('clearFilters') }}
        </button>
      </div>

      <StarsListPane v-else-if="store.viewMode === 'list'" />

      <StarsGalaxyView
        v-else-if="galaxyReady && showGalaxy"
        :items="store.filtered"
        :focus-id="store.galaxyFocus"
        :is-mobile="isMobile"
        @select="onGalaxySelect"
      />
    </template>
  </div>
</template>
