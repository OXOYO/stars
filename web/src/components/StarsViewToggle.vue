<script setup>
import { computed } from 'vue';
import { useStarsStore } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';
import { isWebGLAvailable } from '../galaxy/webgl';

const store = useStarsStore();
const { t } = useStarsI18n();

const webglOk = computed(() => isWebGLAvailable());

function setMode(mode) {
  if (mode === 'galaxy' && !webglOk.value) return;
  store.setViewMode(mode);
}
</script>

<template>
  <div class="stars-view-toggle" role="group" :aria-label="t('viewModeLabel')">
    <button
      type="button"
      class="stars-view-toggle__btn"
      :class="{ 'is-active': store.viewMode === 'list' }"
      :aria-pressed="store.viewMode === 'list'"
      @click="setMode('list')"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.5A.75.75 0 0 1 2.75 8h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8.25Zm0 4.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
        />
      </svg>
      <span>{{ t('viewList') }}</span>
    </button>
    <button
      type="button"
      class="stars-view-toggle__btn"
      :class="{ 'is-active': store.viewMode === 'galaxy', 'is-disabled': !webglOk }"
      :aria-pressed="store.viewMode === 'galaxy'"
      :disabled="!webglOk"
      :title="webglOk ? t('viewGalaxy') : t('galaxyUnsupported')"
      @click="setMode('galaxy')"
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
        <path d="M12 2.5c5.25 0 9.5 4.25 9.5 9.5S17.25 21.5 12 21.5" />
        <path d="M12 7c2.9 0 5.25 2.35 5.25 5.25S14.9 17.5 12 17.5" />
        <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      </svg>
      <span>{{ t('viewGalaxy') }}</span>
    </button>
  </div>
</template>
