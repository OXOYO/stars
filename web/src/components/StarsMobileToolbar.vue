<script setup>
import { computed } from 'vue';
import { useStarsStore } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';

import StarsViewToggle from './StarsViewToggle.vue';

const emit = defineEmits(['open-filters']);

const store = useStarsStore();
const { t } = useStarsI18n();

const activeFilterCount = computed(() => {
  let n = 0;
  if (store.qApplied?.trim()) n += 1;
  if (store.language !== 'all') n += 1;
  if (store.license !== 'all') n += 1;
  if (store.starredYear !== 'all') n += 1;
  if (store.type !== 'all') n += 1;
  return n;
});

const filterLabel = computed(() => {
  const n = activeFilterCount.value;
  if (n > 0) return t.value('filtersWithCount', { count: n });
  return t.value('filtersOpen');
});
</script>

<template>
  <div class="stars-mobile-toolbar">
    <button type="button" class="stars-mobile-toolbar__filters" @click="emit('open-filters')">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M1.5 2.75a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1-.75-.75Zm2.5 5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Zm2.5 5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H7.25a.75.75 0 0 1-.75-.75Z"
        />
      </svg>
      {{ filterLabel }}
    </button>
    <StarsViewToggle />
    <p
      v-if="!store.loading && !store.error && store.viewMode !== 'galaxy'"
      class="stars-mobile-toolbar__count"
      v-html="t('filterCount', { filtered: store.filtered.length.toLocaleString(), total: store.total.toLocaleString() })"
    />
  </div>
</template>
