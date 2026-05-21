<script setup>
import { useStarsStore } from '../composables/useStarsStore';
import StarsFilters from './StarsFilters.vue';

const store = useStarsStore();
</script>

<template>
  <section class="stars-sidebar-filters">
    <StarsFilters
      v-if="!store.loading && !store.error"
      v-model:type="store.type"
      v-model:sort="store.sort"
      v-model:license="store.license"
      v-model:starred-year="store.starredYear"
      :license-options="store.licenseOptions"
      :year-options="store.yearOptions"
    />
  </section>
</template>
