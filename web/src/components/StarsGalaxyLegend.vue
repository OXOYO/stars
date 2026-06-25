<script setup>
import { computed } from 'vue';
import { langColor } from '../utils/lang-colors';
import { useStarsI18n } from '../composables/useStarsI18n';

const props = defineProps({
  items: { type: Array, default: () => [] },
  starTiers: { type: Array, default: () => [] },
  activeFilter: {
    type: Object,
    default: () => ({ langs: [], tiers: [] }),
  },
});

const emit = defineEmits(['select-lang', 'select-tier', 'clear-filter']);

const { t } = useStarsI18n();

const tierColors = {
  '50k+': '#ffd700',
  '10k+': '#ff9f43',
  '1k+': '#54a0ff',
  '<1k': '#8b949e',
};

const hasSelection = computed(() => {
  const f = props.activeFilter || {};
  return (f.langs?.length || 0) > 0 || (f.tiers?.length || 0) > 0;
});

function tierColor(key) {
  return tierColors[key] || '#8b949e';
}

function tierLabel(key) {
  const map = {
    '50k+': t.value('galaxyTier50k'),
    '10k+': t.value('galaxyTier10k'),
    '1k+': t.value('galaxyTier1k'),
    '<1k': t.value('galaxyTierUnder1k'),
  };
  return map[key] || key;
}

function langLabel(name) {
  return name === '其他' ? t.value('otherLang') : name;
}

function isTierActive(key) {
  return props.activeFilter?.tiers?.includes(key) ?? false;
}

function isLangActive(name) {
  return props.activeFilter?.langs?.includes(name) ?? false;
}

function onTierClick(key) {
  emit('select-tier', key);
}

function onLangClick(name) {
  emit('select-lang', name);
}
</script>

<template>
  <div v-if="items.length || starTiers.length" class="stars-galaxy-legend">
    <div v-if="hasSelection" class="stars-galaxy-legend__toolbar">
      <button type="button" class="stars-galaxy-legend__clear" @click="emit('clear-filter')">
        {{ t('galaxyLegendClear') }}
      </button>
    </div>
    <div v-if="starTiers.length" class="stars-galaxy-legend__block">
      <span class="stars-galaxy-legend__title">{{ t('galaxyStarTierTitle') }}</span>
      <ul class="stars-galaxy-legend__list" role="list">
        <li v-for="row in starTiers" :key="row.key" class="stars-galaxy-legend__item" role="listitem">
          <button
            type="button"
            class="stars-galaxy-legend__btn"
            :class="{ 'is-active': isTierActive(row.key) }"
            :aria-pressed="isTierActive(row.key)"
            @click="onTierClick(row.key)"
          >
            <span class="stars-galaxy-legend__dot" :style="{ background: tierColor(row.key) }" aria-hidden="true" />
            <span class="stars-galaxy-legend__name">{{ tierLabel(row.key) }}</span>
            <span class="stars-galaxy-legend__count">{{ row.count }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div v-if="items.length" class="stars-galaxy-legend__block">
      <span class="stars-galaxy-legend__title">{{ t('galaxyLegendTitle') }}</span>
      <ul class="stars-galaxy-legend__list" role="list" :aria-label="t('galaxyLegendTitle')">
        <li v-for="row in items" :key="row.name" class="stars-galaxy-legend__item" role="listitem">
          <button
            type="button"
            class="stars-galaxy-legend__btn"
            :class="{ 'is-active': isLangActive(row.name) }"
            :aria-pressed="isLangActive(row.name)"
            @click="onLangClick(row.name)"
          >
            <span class="stars-galaxy-legend__dot" :style="{ background: langColor(row.name) }" aria-hidden="true" />
            <span class="stars-galaxy-legend__name">{{ langLabel(row.name) }}</span>
            <span class="stars-galaxy-legend__count">{{ row.count }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
