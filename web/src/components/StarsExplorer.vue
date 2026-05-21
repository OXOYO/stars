<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import {
  useStarsStore,
  registerStarsListScroller,
  registerStarsRowRemeasure,
  remeasureStarsList,
} from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';
import StarCard from './StarCard.vue';
import StarsStatsBar from './StarsStatsBar.vue';
import StarsActiveFilters from './StarsActiveFilters.vue';
import StarsMobileToolbar from './StarsMobileToolbar.vue';

defineProps({
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['open-filters']);

const store = useStarsStore();
const { t } = useStarsI18n();

const listViewportRef = ref(null);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: store.filtered.length,
    getScrollElement: () => listViewportRef.value,
    estimateSize: () => store.virtualRowHeight,
    overscan: 8,
    shouldAdjustScrollPositionOnItemSizeChange: () => false,
  }))
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());

function measureRow(el) {
  if (el) {
    virtualizer.value.measureElement(el);
  }
}

function scrollListToTop() {
  listViewportRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(async () => {
  registerStarsListScroller(scrollListToTop);
  registerStarsRowRemeasure((index) =>
    remeasureStarsList(virtualizer, listViewportRef.value, index)
  );
  await store.bootstrap();
  window.addEventListener('popstate', store.onPopState);
});

onUnmounted(() => {
  registerStarsListScroller(null);
  registerStarsRowRemeasure(null);
  window.removeEventListener('popstate', store.onPopState);
});

watch(
  () => store.filtered.length,
  () => {
    remeasureStarsList(virtualizer, listViewportRef.value);
  }
);
</script>

<template>
  <div class="stars-explorer">
    <p v-if="store.loading" class="stars-explorer__status">{{ t('loading') }}</p>
    <p v-else-if="store.error" class="stars-explorer__status stars-explorer__status--error">
      {{ t('loadError', { error: store.error }) }}
    </p>
    <template v-else>
      <StarsMobileToolbar v-if="isMobile" @open-filters="emit('open-filters')" />
      <StarsStatsBar :is-mobile="isMobile" />
      <StarsActiveFilters />
      <div class="stars-explorer__list-pane">
        <div v-if="store.filtered.length === 0" class="stars-explorer__empty">
          <p>{{ t('empty') }}</p>
          <button type="button" class="stars-explorer__clear-btn" @click="store.clearAllFilters">
            {{ t('clearFilters') }}
          </button>
        </div>
        <div v-else ref="listViewportRef" class="stars-explorer__viewport">
          <div
            class="stars-explorer__virtual-spacer"
            :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }"
          >
            <div
              v-for="row in virtualRows"
              :key="String(row.key)"
              :ref="measureRow"
              class="stars-explorer__virtual-row"
              :data-index="row.index"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }"
            >
              <StarCard
                :item="store.filtered[row.index]"
                :item-index="row.index"
                :show-language="store.showLanguage"
                :show-stars-count="store.showStarsCount"
                :show-license="store.showLicense"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
