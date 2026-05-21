<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { formatGeneratedAt } from './i18n';
import { useStarsStore } from './composables/useStarsStore';
import { useStarsI18n } from './composables/useStarsI18n';
import { MOBILE_MEDIA, useMediaQuery } from './composables/useMediaQuery';
import StarsNavSearch from './components/StarsNavSearch.vue';
import StarsSidebarFilters from './components/StarsSidebarFilters.vue';
import StarsSidebarLangNav from './components/StarsSidebarLangNav.vue';
import StarsExplorer from './components/StarsExplorer.vue';
import StarsMobileFiltersSheet from './components/StarsMobileFiltersSheet.vue';

const isMobile = useMediaQuery(MOBILE_MEDIA);
const filtersSheetOpen = ref(false);

const store = useStarsStore();
const { t, locale, basePath } = useStarsI18n();

const siteTitle = computed(() => store.pageTitle);

const githubUrl = computed(() => {
  if (store.owner && store.repoName) {
    return `https://github.com/${store.owner}/${store.repoName}`;
  }
  return 'https://github.com';
});

/** 页脚「stars」指向本项目官方仓库（Fork 后仍指向上游工具库） */
const toolRepoUrl = computed(() => {
  const meta = store.siteMeta;
  const owner = meta?.toolRepoOwner || 'OXOYO';
  const name = meta?.toolRepoName || 'stars';
  return `https://github.com/${owner}/${name}`;
});

const toolVersion = computed(() => {
  const v = store.siteMeta?.toolVersion;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
});

const footerMetaHtml = computed(() => {
  const updatedAt = formatGeneratedAt(store.generatedAt, locale.value);
  return t.value('footerMeta', { updatedAt });
});

const homeHref = computed(() => {
  const params = new URLSearchParams();
  if (locale.value === 'en') params.set('lang', 'en');
  const qs = params.toString();
  return `${basePath.value}${qs ? `?${qs}` : ''}`;
});

function switchUiLang(lang) {
  store.setUiLocale(lang);
}

function goHome() {
  store.clearAllFilters();
}

onMounted(() => {
  document.title = siteTitle.value;
});

watch(siteTitle, (title) => {
  if (title) document.title = title;
});
</script>

<template>
  <div class="stars-app" :class="{ 'stars-app--mobile': isMobile }">
    <header class="stars-app__header">
      <a
        class="stars-app__brand"
        :href="homeHref"
        aria-label="Home"
        @click.prevent="goHome"
      >
        <span class="stars-app__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path
              fill="currentColor"
              d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
            />
          </svg>
        </span>
        <h1 class="stars-app__title">{{ store.pageTitle }}</h1>
      </a>
      <StarsNavSearch />
      <div class="stars-app__header-actions">
        <div class="stars-app__lang" role="group" aria-label="UI language">
          <button
            type="button"
            class="stars-app__lang-btn"
            :class="{ 'is-active': locale === 'zh-CN' }"
            :aria-label="t('langZh')"
            @click="switchUiLang('zh-CN')"
          >
            <span class="stars-app__lang-short" aria-hidden="true">中</span>
            <span class="stars-app__lang-full">{{ t('langZh') }}</span>
          </button>
          <button
            type="button"
            class="stars-app__lang-btn"
            :class="{ 'is-active': locale === 'en' }"
            :aria-label="t('langEn')"
            @click="switchUiLang('en')"
          >
            <span class="stars-app__lang-short" aria-hidden="true">EN</span>
            <span class="stars-app__lang-full">{{ t('langEn') }}</span>
          </button>
        </div>
        <a
          class="stars-app__github"
          :href="githubUrl"
          target="_blank"
          rel="noreferrer"
          :aria-label="t('navGitHub')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          <span class="stars-app__github-label">{{ t('navGitHub') }}</span>
        </a>
      </div>
    </header>

    <div class="stars-app__body">
      <aside v-show="!isMobile" class="stars-app__sidebar">
        <StarsSidebarFilters />
        <StarsSidebarLangNav />
      </aside>

      <main class="stars-app__main">
        <StarsExplorer
          :is-mobile="isMobile"
          @open-filters="filtersSheetOpen = true"
        />
        <footer class="stars-app__footer">
          <p class="stars-app__footer-meta" v-html="footerMetaHtml" />
          <p class="stars-app__footer-copy">
            Generated by
            <a :href="toolRepoUrl" target="_blank" rel="noreferrer">stars</a><template v-if="toolVersion"> v{{ toolVersion }}</template>
            · MIT License
          </p>
        </footer>
      </main>
    </div>

    <StarsMobileFiltersSheet
      :open="filtersSheetOpen"
      @close="filtersSheetOpen = false"
    />
  </div>
</template>
