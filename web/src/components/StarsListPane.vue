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

onMounted(() => {
  registerStarsListScroller(scrollListToTop);
  registerStarsRowRemeasure((index) =>
    remeasureStarsList(virtualizer, listViewportRef.value, index)
  );
});

onUnmounted(() => {
  registerStarsListScroller(null);
  registerStarsRowRemeasure(null);
});

watch(
  () => store.filtered.length,
  () => {
    remeasureStarsList(virtualizer, listViewportRef.value);
  }
);
</script>

<template>
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
