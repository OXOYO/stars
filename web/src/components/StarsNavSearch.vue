<script setup>
import { useStarsStore } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';

const store = useStarsStore();
const { t } = useStarsI18n();

function onInput(e) {
  store.qInput = e.target.value;
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    store.onSearch();
  }
}
</script>

<template>
  <label class="stars-nav-search" :aria-label="t('searchPlaceholder')">
    <svg
      class="stars-nav-search__icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <circle cx="6.75" cy="6.75" r="3.75" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        d="M9.5 9.5 12.25 12.25"
      />
    </svg>
    <input
      :value="store.qInput"
      type="search"
      class="stars-nav-search__input"
      :placeholder="t('searchPlaceholder')"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
    />
  </label>
</template>
