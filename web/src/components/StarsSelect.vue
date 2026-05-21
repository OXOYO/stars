<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, required: true },
  options: {
    type: Array,
    default: () => [],
  },
  ariaLabel: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit?.label ?? props.modelValue;
});

function updatePanelPosition() {
  const el = triggerRef.value;
  if (!el || typeof window === 'undefined') return;

  const rect = el.getBoundingClientRect();
  const gap = 4;
  const maxPanel = 280;
  const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(maxPanel, openUp ? spaceAbove : spaceBelow);

  panelStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: 2000,
    maxHeight: `${Math.max(120, maxHeight)}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + gap}px` }
      : { top: `${rect.bottom + gap}px` }),
  };
}

async function setOpen(next) {
  open.value = next;
  if (next) {
    await nextTick();
    updatePanelPosition();
  }
}

function toggleOpen() {
  setOpen(!open.value);
}

function pick(value) {
  emit('update:modelValue', value);
  setOpen(false);
}

function onDocumentPointer(e) {
  const t = e.target;
  if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return;
  setOpen(false);
}

function onEscape(e) {
  if (e.key === 'Escape') setOpen(false);
}

function onLayoutChange() {
  if (open.value) updatePanelPosition();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer);
  document.addEventListener('keydown', onEscape);
  window.addEventListener('resize', onLayoutChange);
  window.addEventListener('scroll', onLayoutChange, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointer);
  document.removeEventListener('keydown', onEscape);
  window.removeEventListener('resize', onLayoutChange);
  window.removeEventListener('scroll', onLayoutChange, true);
});

watch(
  () => props.options.length,
  () => {
    if (open.value) nextTick(updatePanelPosition);
  }
);
</script>

<template>
  <div class="stars-select" :class="{ 'is-open': open }">
    <button
      ref="triggerRef"
      type="button"
      class="stars-select__trigger"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
    >
      <span class="stars-select__value">{{ selectedLabel }}</span>
      <svg class="stars-select__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.22 6.47 8 10.25l3.78-3.78 1.06 1.06L8 12.38 3.16 7.53l1.06-1.06z"
        />
      </svg>
    </button>

    <Teleport to="body">
      <ul
        v-show="open"
        ref="panelRef"
        class="stars-select__panel"
        role="listbox"
        :style="panelStyle"
      >
        <li
          v-for="opt in options"
          :key="opt.value"
          role="option"
          class="stars-select__option"
          :class="{ 'is-selected': modelValue === opt.value }"
          :aria-selected="modelValue === opt.value"
          @click="pick(opt.value)"
        >
          {{ opt.label }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>
