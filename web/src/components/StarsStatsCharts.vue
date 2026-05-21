<script setup>
import { computed } from 'vue';
import {
  useStarsStore,
  patchLanguageInQuery,
  patchLicenseInQuery,
  patchStarredYearInQuery,
} from '../composables/useStarsStore';
import { useStarsI18n } from '../composables/useStarsI18n';
import {
  buildChartOverlayCounts,
  itemLanguageKey,
  itemYearKey,
} from '../utils/stars-filter';

const store = useStarsStore();
const { t } = useStarsI18n();

const stats = computed(() => store.stats);

const filterCtx = computed(() => ({
  q: store.qApplied,
  language: store.language,
  license: store.license,
  starredYear: store.starredYear,
  type: store.type,
  sort: store.sort,
}));

const showOverlay = computed(() => store.hasActiveFilters);

const langOverlay = computed(() => {
  if (!showOverlay.value || !stats.value?.topLanguages?.length) return null;
  const keys = stats.value.topLanguages.map((r) => r.name);
  return buildChartOverlayCounts(
    store.items,
    filterCtx.value,
    'language',
    keys,
    itemLanguageKey
  );
});

const licOverlay = computed(() => {
  if (!showOverlay.value || !stats.value?.topLicenses?.length) return null;
  const keys = stats.value.topLicenses.map((r) => r.name);
  return buildChartOverlayCounts(
    store.items,
    filterCtx.value,
    'license',
    keys,
    (item) => item.license || ''
  );
});

const yearOverlay = computed(() => {
  if (!showOverlay.value || !stats.value?.starredByYear?.length) return null;
  const keys = stats.value.starredByYear.map((r) => r.year);
  return buildChartOverlayCounts(store.items, filterCtx.value, 'starredYear', keys, itemYearKey);
});

const maxLang = computed(() =>
  Math.max(1, ...(stats.value?.topLanguages || []).map((x) => x.count))
);
const maxLic = computed(() =>
  Math.max(1, ...(stats.value?.topLicenses || []).map((x) => x.count))
);
const maxYear = computed(() =>
  Math.max(1, ...(stats.value?.starredByYear || []).map((x) => x.count))
);

function barWidth(count, max) {
  return `${Math.round((count / max) * 100)}%`;
}

function overlayShare(filtered, total) {
  if (!total || filtered <= 0) return '0%';
  return `${Math.min(100, Math.round((filtered / total) * 100))}%`;
}

function overlayCount(map, key) {
  return map?.get(key) ?? 0;
}

function countLabel(map, key, total) {
  const f = overlayCount(map, key);
  if (!showOverlay.value || f === total) return String(total);
  return t.value('statCountFiltered', {
    filtered: f.toLocaleString(),
    total: total.toLocaleString(),
  });
}

function yearTitle(row) {
  const f = overlayCount(yearOverlay.value, row.year);
  if (!showOverlay.value) return `${row.year}: ${row.count.toLocaleString()}`;
  return `${row.year}: ${f.toLocaleString()} / ${row.count.toLocaleString()}`;
}

function onLangClick(name) {
  patchLanguageInQuery(store.language === name ? 'all' : name);
}

function onLicClick(name) {
  patchLicenseInQuery(store.license === name ? 'all' : name);
}

function onYearClick(year) {
  patchStarredYearInQuery(store.starredYear === year ? 'all' : year);
}
</script>

<template>
  <div v-if="stats" class="stars-stats__body">
    <p class="stars-stats__hint">{{ t('statClickHint') }}</p>

    <div v-if="stats.topLanguages?.length" class="stars-stats__block">
      <h3 class="stars-stats__heading">{{ t('statTopLang') }}</h3>
      <ul class="stars-stats__bars">
        <li v-for="row in stats.topLanguages" :key="row.name">
          <button
            type="button"
            class="stars-stats__bar-btn"
            :class="{ 'is-active': store.language === row.name }"
            @click="onLangClick(row.name)"
          >
            <span class="stars-stats__bar-label">{{ row.name }}</span>
            <span class="stars-stats__bar-track">
              <span class="stars-stats__bar-fill" :style="{ width: barWidth(row.count, maxLang) }">
                <span
                  v-if="showOverlay && overlayCount(langOverlay, row.name) > 0"
                  class="stars-stats__bar-overlay"
                  :style="{
                    width: overlayShare(overlayCount(langOverlay, row.name), row.count),
                  }"
                />
              </span>
            </span>
            <span class="stars-stats__bar-count">{{ countLabel(langOverlay, row.name, row.count) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="stats.topLicenses?.length" class="stars-stats__block">
      <h3 class="stars-stats__heading">{{ t('statTopLicense') }}</h3>
      <ul class="stars-stats__bars">
        <li v-for="row in stats.topLicenses" :key="row.name">
          <button
            type="button"
            class="stars-stats__bar-btn"
            :class="{ 'is-active': store.license === row.name }"
            @click="onLicClick(row.name)"
          >
            <span class="stars-stats__bar-label">{{ row.name }}</span>
            <span class="stars-stats__bar-track">
              <span
                class="stars-stats__bar-fill stars-stats__bar-fill--license"
                :style="{ width: barWidth(row.count, maxLic) }"
              >
                <span
                  v-if="showOverlay && overlayCount(licOverlay, row.name) > 0"
                  class="stars-stats__bar-overlay stars-stats__bar-overlay--license"
                  :style="{
                    width: overlayShare(overlayCount(licOverlay, row.name), row.count),
                  }"
                />
              </span>
            </span>
            <span class="stars-stats__bar-count">{{ countLabel(licOverlay, row.name, row.count) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="stats.starredByYear?.length" class="stars-stats__block stars-stats__block--years">
      <h3 class="stars-stats__heading">{{ t('statByYear') }}</h3>
      <div class="stars-stats__years">
        <button
          v-for="row in stats.starredByYear"
          :key="row.year"
          type="button"
          class="stars-stats__year-col"
          :class="{ 'is-active': store.starredYear === row.year }"
          :title="yearTitle(row)"
          :aria-label="yearTitle(row)"
          :aria-pressed="store.starredYear === row.year"
          @click="onYearClick(row.year)"
        >
          <span class="stars-stats__year-bar" :style="{ height: barWidth(row.count, maxYear) }">
            <span
              v-if="showOverlay && overlayCount(yearOverlay, row.year) > 0"
              class="stars-stats__year-overlay"
              :style="{
                height: overlayShare(overlayCount(yearOverlay, row.year), row.count),
              }"
            />
          </span>
          <span class="stars-stats__year-label">{{ row.year.slice(2) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
