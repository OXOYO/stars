<script setup>
import { computed } from 'vue';
import {
  useStarsStore,
  patchLanguageInQuery,
  patchLicenseInQuery,
  patchStarredYearInQuery,
} from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';

const store = useStarsStore();
const { t } = useStarsI18n();

const tags = computed(() => {
  const list = [];
  if (store.qApplied?.trim()) {
    list.push({
      id: 'q',
      text: `${t.value('filterSearch')}: ${store.qApplied.trim()}`,
      clear: () => store.clearFilterKey('q'),
    });
  }
  if (store.language !== 'all') {
    list.push({
      id: 'lang',
      text: `${t.value('filterLang')}: ${store.language === '其他' ? t.value('otherLang') : store.language}`,
      clear: () => patchLanguageInQuery('all'),
    });
  }
  if (store.license !== 'all') {
    list.push({
      id: 'license',
      text: `${t.value('license')}: ${store.license}`,
      clear: () => patchLicenseInQuery('all'),
    });
  }
  if (store.starredYear !== 'all') {
    list.push({
      id: 'year',
      text: `${t.value('starredYear')}: ${store.starredYear}`,
      clear: () => patchStarredYearInQuery('all'),
    });
  }
  if (store.type !== 'all') {
    const typeLabel =
      store.type === 'sources'
        ? t.value('typeSources')
        : store.type === 'forks'
          ? t.value('typeForks')
          : store.type;
    list.push({
      id: 'type',
      text: `${t.value('type')}: ${typeLabel}`,
      clear: () => store.clearFilterKey('type'),
    });
  }
  return list;
});

const countHtml = computed(() =>
  t.value('filterCount', {
    filtered: store.filtered.length.toLocaleString(),
    total: store.total.toLocaleString(),
  })
);
</script>

<template>
  <div v-if="store.hasActiveFilters" class="stars-active-filters">
    <span class="stars-active-filters__label">{{ t('filterActive') }}</span>
    <span class="stars-active-filters__count" v-html="countHtml" />
    <button
      v-for="tag in tags"
      :key="tag.id"
      type="button"
      class="stars-active-filters__chip"
      @click="tag.clear"
    >
      {{ tag.text }}
      <span class="stars-active-filters__remove" aria-hidden="true">×</span>
    </button>
  </div>
</template>
