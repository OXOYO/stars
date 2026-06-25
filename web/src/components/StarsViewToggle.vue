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
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm6.25-2.5a.75.75 0 0 1 .75.75v1.19l1.03.52a.75.75 0 0 1-.67 1.34l-1.36-.68A.75.75 0 0 1 7.75 8V6.25a.75.75 0 0 1 .75-.75Z"
        />
      </svg>
      <span>{{ t('viewGalaxy') }}</span>
    </button>
  </div>
</template>
