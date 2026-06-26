<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import StarCard from './StarCard.vue';
import { useStarsStore } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';

const props = defineProps({
  item: { type: Object, required: true },
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'locate']);

const store = useStarsStore();
const { t } = useStarsI18n();
const detailExpanded = ref(false);

watch(
  () => props.item.id,
  () => {
    detailExpanded.value = false;
  }
);

function isTypingTarget() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}

function onKeydown(e) {
  if (isTypingTarget()) return;
  if (e.key === 'Escape') {
    emit('close');
    return;
  }
  if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    emit('locate');
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <aside
    class="stars-galaxy-detail"
    :class="{ 'stars-galaxy-detail--mobile': isMobile }"
    role="region"
    :aria-label="t('galaxyDetailTitle')"
  >
    <div class="stars-galaxy-detail__card">
      <div class="stars-galaxy-detail__actions">
        <button
          type="button"
          class="stars-galaxy-detail__locate"
          :aria-label="t('galaxyDetailLocate')"
          :title="t('galaxyDetailLocateHint')"
          @click="emit('locate')"
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
          type="button"
          class="stars-galaxy-detail__toggle"
          :aria-label="detailExpanded ? t('galaxyDetailCollapse') : t('galaxyDetailExpand')"
          :title="detailExpanded ? t('galaxyDetailCollapse') : t('galaxyDetailExpand')"
          :aria-expanded="detailExpanded"
          @click="detailExpanded = !detailExpanded"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path v-if="detailExpanded" d="M4 10 8 6l4 4" />
            <path v-else d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <button
          type="button"
          class="stars-galaxy-detail__close"
          :aria-label="t('galaxyDetailClose')"
          @click="emit('close')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 1 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 1 1-1.275.326.749.749 0 0 1 .215-.734L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
            />
          </svg>
        </button>
      </div>
      <StarCard
        :item="item"
        :item-index="0"
        detail-mode
        :detail-expanded="detailExpanded"
        :show-language="store.showLanguage"
        :show-stars-count="store.showStarsCount"
        :show-license="store.showLicense"
      />
    </div>
  </aside>
</template>
