<script setup>
import { onMounted, onUnmounted } from 'vue';
import StarCard from './StarCard.vue';
import { useStarsStore } from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';

defineProps({
  item: { type: Object, required: true },
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const store = useStarsStore();
const { t } = useStarsI18n();

function onKeydown(e) {
  if (e.key === 'Escape') emit('close');
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
      <StarCard
        :item="item"
        :item-index="0"
        :show-language="store.showLanguage"
        :show-stars-count="store.showStarsCount"
        :show-license="store.showLicense"
      />
    </div>
  </aside>
</template>
