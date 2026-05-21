<script setup>
import { computed } from 'vue';
import { useStarsI18n } from '../composables/useStarsI18n';
import StarsSelect from './StarsSelect.vue';

const props = defineProps({
  type: { type: String, default: 'all' },
  sort: { type: String, default: 'recently_starred' },
  license: { type: String, default: 'all' },
  starredYear: { type: String, default: 'all' },
  licenseOptions: { type: Array, default: () => [] },
  yearOptions: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:type', 'update:sort', 'update:license', 'update:starredYear']);

const { t } = useStarsI18n();

const licenseSelectOptions = computed(() => [
  { value: 'all', label: t.value('licenseAll') },
  ...props.licenseOptions.map((opt) => ({
    value: opt.name,
    label: `${opt.name}（${opt.count}）`,
  })),
]);

const yearSelectOptions = computed(() => [
  { value: 'all', label: t.value('yearAll') },
  ...props.yearOptions.map((opt) => ({
    value: opt.year,
    label: `${opt.year}（${opt.count}）`,
  })),
]);

const typeSelectOptions = computed(() => [
  { value: 'all', label: t.value('typeAll') },
  { value: 'sources', label: t.value('typeSources') },
  { value: 'forks', label: t.value('typeForks') },
]);

const sortSelectOptions = computed(() => [
  { value: 'recently_starred', label: t.value('sortRecentlyStarred') },
  { value: 'recently_active', label: t.value('sortRecentlyActive') },
  { value: 'most_stars', label: t.value('sortMostStars') },
]);
</script>

<template>
  <div class="stars-filters">
    <div class="stars-filters__field">
      <span class="stars-filters__label" id="stars-filter-license">{{ t('license') }}</span>
      <StarsSelect
        :model-value="license"
        :options="licenseSelectOptions"
        :aria-label="t('license')"
        @update:model-value="emit('update:license', $event)"
      />
    </div>

    <div class="stars-filters__field">
      <span class="stars-filters__label" id="stars-filter-year">{{ t('starredYear') }}</span>
      <StarsSelect
        :model-value="starredYear"
        :options="yearSelectOptions"
        :aria-label="t('starredYear')"
        @update:model-value="emit('update:starredYear', $event)"
      />
    </div>

    <div class="stars-filters__field">
      <span class="stars-filters__label" id="stars-filter-type">{{ t('type') }}</span>
      <StarsSelect
        :model-value="type"
        :options="typeSelectOptions"
        :aria-label="t('type')"
        @update:model-value="emit('update:type', $event)"
      />
    </div>

    <div class="stars-filters__field">
      <span class="stars-filters__label" id="stars-filter-sort">{{ t('sortBy') }}</span>
      <StarsSelect
        :model-value="sort"
        :options="sortSelectOptions"
        :aria-label="t('sortBy')"
        @update:model-value="emit('update:sort', $event)"
      />
    </div>
  </div>
</template>
