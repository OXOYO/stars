<script setup>
import { computed } from 'vue';
import { useStarsStore, patchLanguageInQuery } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';
import { buildLanguageOptions } from '../utils/stars-filter';
import { langColor, langSlug } from '../utils/lang-colors';

const store = useStarsStore();
const { t } = useStarsI18n();

function langLabel(name) {
  return name === '其他' ? t.value('otherLang') : name;
}

const allItem = computed(() => ({
  key: 'all',
  name: 'all',
  count: store.total,
  label: t.value('langAll'),
  active: store.language === 'all',
}));

const langItems = computed(() => {
  const options = buildLanguageOptions(store.items || []);
  return options.map((opt) => ({
    key: opt.name,
    name: opt.name,
    count: opt.count,
    label: langLabel(opt.name),
    active: store.language === opt.name,
  }));
});

function onLangClick(key) {
  patchLanguageInQuery(key === 'all' ? 'all' : key);
}
</script>

<template>
  <div v-if="!store.loading && !store.error" class="stars-sidebar-lang-wrap">
    <button
      type="button"
      class="stars-sidebar-lang__link stars-sidebar-lang__all"
      :class="{ 'is-active': allItem.active }"
      @click="onLangClick('all')"
    >
      <span class="stars-sidebar-lang__label">{{ allItem.label }}</span>
      <span class="stars-sidebar-lang__count">{{ allItem.count }}</span>
    </button>
    <nav class="stars-sidebar-lang" :aria-label="t('filterLang')">
      <button
        v-for="item in langItems"
        :key="item.key"
        type="button"
        class="stars-sidebar-lang__link"
        :class="[{ 'is-active': item.active }, `lang--${langSlug(item.name)}`]"
        :style="{ '--lang-accent': langColor(item.name) }"
        @click="onLangClick(item.key)"
      >
        <span class="stars-sidebar-lang__dot" />
        <span class="stars-sidebar-lang__label">{{ item.label }}</span>
        <span class="stars-sidebar-lang__count">{{ item.count }}</span>
      </button>
    </nav>
  </div>
</template>
