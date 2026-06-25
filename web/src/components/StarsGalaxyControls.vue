<script setup>
import { useStarsI18n } from '../composables/useStarsI18n';

defineProps({
  autoRotate: { type: Boolean, default: true },
  showLegend: { type: Boolean, default: false },
  showFocusCenter: { type: Boolean, default: true },
  showFocusOwner: { type: Boolean, default: false },
});

const emit = defineEmits([
  'zoom-in',
  'zoom-out',
  'reset',
  'toggle-auto-rotate',
  'toggle-legend',
  'focus-center',
  'focus-owner',
]);

const { t } = useStarsI18n();
</script>

<template>
  <div class="stars-galaxy-controls" role="toolbar" :aria-label="t('galaxyControlsLabel')">
    <button type="button" class="stars-galaxy-controls__btn" :title="t('galaxyZoomIn')" @click="emit('zoom-in')">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path fill="currentColor" d="M7.25 2.75a.75.75 0 0 1 1.5 0v3.75H12.5a.75.75 0 0 1 0 1.5H8.75V12.5a.75.75 0 0 1-1.5 0V8.75H2.75a.75.75 0 0 1 0-1.5h3.75V2.75Z" />
      </svg>
    </button>
    <button type="button" class="stars-galaxy-controls__btn" :title="t('galaxyZoomOut')" @click="emit('zoom-out')">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path fill="currentColor" d="M2.75 7.25a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
      </svg>
    </button>
    <button type="button" class="stars-galaxy-controls__btn" :title="t('galaxyReset')" @click="emit('reset')">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m21 21-6-6" />
        <path d="M3.268 12.043A7.02 7.02 0 0 0 9.902 17a7.01 7.01 0 0 0 7.043-6.131a7 7 0 0 0-5.314-7.672A7.02 7.02 0 0 0 3.39 7.6" />
        <path d="M3 4v4h4" />
      </svg>
    </button>
    <button
      v-if="showFocusCenter"
      type="button"
      class="stars-galaxy-controls__btn"
      :title="t('galaxyFocusCenter')"
      @click="emit('focus-center')"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    </button>
    <button
      v-if="showFocusOwner"
      type="button"
      class="stars-galaxy-controls__btn"
      :title="t('galaxyFocusOwner')"
      @click="emit('focus-owner')"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </button>
    <button
      type="button"
      class="stars-galaxy-controls__btn"
      :class="{ 'is-active': autoRotate }"
      :title="autoRotate ? t('galaxyAutoRotateOff') : t('galaxyAutoRotateOn')"
      @click="emit('toggle-auto-rotate')"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16h4v4" />
        <path d="M19.458 11.042c.86-2.366.722-4.58-.6-5.9c-2.272-2.274-7.185-1.045-10.973 2.743s-5.017 8.701-2.744 10.974c2.227 2.226 6.987 1.093 10.74-2.515" />
      </svg>
    </button>
    <button
      type="button"
      class="stars-galaxy-controls__btn"
      :class="{ 'is-active': showLegend }"
      :aria-pressed="showLegend"
      :title="showLegend ? t('galaxyLegendHide') : t('galaxyLegendShow')"
      @click="emit('toggle-legend')"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.5A.75.75 0 0 1 2.75 8h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8.25Zm0 4.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
        />
      </svg>
    </button>
  </div>
</template>
