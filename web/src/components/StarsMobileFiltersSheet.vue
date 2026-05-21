<script setup>
import { onMounted, onUnmounted, toRef, watch } from 'vue';
import { useMobileSheetInset } from '../composables/useMobileSheetInset';
import { useStarsI18n } from '../composables/useStarsI18n';
import StarsSidebarFilters from './StarsSidebarFilters.vue';
import StarsSidebarLangNav from './StarsSidebarLangNav.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const { t } = useStarsI18n();

useMobileSheetInset(toRef(props, 'open'));

function onBackdropClick() {
  emit('close');
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) emit('close');
}

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="stars-mobile-sheet"
      :class="{ 'is-open': open }"
      role="presentation"
    >
      <button
        type="button"
        class="stars-mobile-sheet__backdrop"
        :aria-label="t('filtersClose')"
        tabindex="-1"
        @click="onBackdropClick"
      />
      <div
        class="stars-mobile-sheet__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('filtersTitle')"
      >
        <header class="stars-mobile-sheet__header">
          <h2 class="stars-mobile-sheet__title">{{ t('filtersTitle') }}</h2>
          <button
            type="button"
            class="stars-mobile-sheet__close"
            :aria-label="t('filtersClose')"
            @click="emit('close')"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 1 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 1 1-1.275.326.749.749 0 0 1 .215-.734L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
              />
            </svg>
          </button>
        </header>
        <div class="stars-mobile-sheet__body">
          <StarsSidebarFilters />
          <StarsSidebarLangNav />
        </div>
      </div>
    </div>
  </Teleport>
</template>
