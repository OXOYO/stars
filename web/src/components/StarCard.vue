<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { subscribeLayoutResize } from '../composables/useLayoutResize';
import { useStarsI18n } from '../composables/useStarsI18n';
import { useStarsStore, requestStarsRowRemeasure, applyTopicSearch } from '../composables/useStarsStore';
import { langColor, langSlug } from '../utils/lang-colors';
import { formatHomepageHost, formatRepoDate } from '../utils/format-date';
import { githubOwnerAvatarUrl, githubOwnerProfileUrl } from '../utils/github-avatar';
import { collapsedDescHasHiddenContent, measureDescOverflow } from '../utils/desc-overflow';

const props = defineProps({
  item: { type: Object, required: true },
  itemIndex: { type: Number, required: true },
  showLanguage: { type: Boolean, default: true },
  showStarsCount: { type: Boolean, default: true },
  showLicense: { type: Boolean, default: true },
});

const store = useStarsStore();
const { t, locale } = useStarsI18n();
const descExpanded = computed(() => store.isDescExpanded(props.item.id));

const rawDescription = computed(() => props.item.description || '');
const hasDescription = computed(() => !!rawDescription.value.trim());
const descText = computed(() => (hasDescription.value ? rawDescription.value : t.value('descNone')));
const cardRef = ref(null);
const descWrapRef = ref(null);
const descRef = ref(null);
const descOverflows = ref(false);
let descResizeObserver;
let unsubscribeLayoutResize;
let measureRaf = 0;
let resizeDebounceTimer;

const owner = computed(() => props.item.fullName.split('/')[0] || '?');
const ownerProfileUrl = computed(() => githubOwnerProfileUrl(owner.value));
const repo = computed(() => props.item.fullName.split('/')[1] || props.item.fullName);
const avatarLetter = computed(() => (owner.value[0] || '?').toUpperCase());
const langText = computed(() => props.item.language || t.value('otherLang'));
const langAccent = computed(() => langColor(props.item.language || '其他'));
const langClass = computed(() => `lang--${langSlug(langText.value)}`);
const hasLicense = computed(() => !!props.item.license);
const hasLicenseLink = computed(() => !!(props.item.license && props.item.licenseUrl));
const avatarFailed = ref(false);
const avatarSrc = computed(() => githubOwnerAvatarUrl(owner.value, 80));
const showAvatarImg = computed(() => !!avatarSrc.value && !avatarFailed.value);

function scheduleDescOverflowMeasure() {
  if (measureRaf) cancelAnimationFrame(measureRaf);
  measureRaf = requestAnimationFrame(() => {
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      runDescOverflowMeasure();
    });
  });
}

async function applyDescOverflowState(nextOverflows) {
  const prevOverflows = descOverflows.value;
  descOverflows.value = nextOverflows;

  if (!nextOverflows) {
    store.collapseDescExpanded(props.item.id);
  }

  if (prevOverflows !== nextOverflows) {
    await nextTick();
    requestStarsRowRemeasure(props.itemIndex);
  }
}

/** 离屏克隆测量，不剥离页面上的 is-collapsed */
async function runDescOverflowMeasure() {
  await nextTick();
  const el = descRef.value;
  if (!el || !hasDescription.value) {
    await applyDescOverflowState(false);
    return;
  }

  await applyDescOverflowState(measureDescOverflow(el));
}

/** 渲染后复核，去掉「看得见 3 行却还有展开」的误判 */
async function auditDescOverflowAfterRender() {
  await nextTick();
  const el = descRef.value;
  if (!el || !descOverflows.value || descExpanded.value) return;
  if (!el.classList.contains('is-collapsed')) return;
  if (collapsedDescHasHiddenContent(el)) return;

  await applyDescOverflowState(false);
}

function connectDescResizeObservers() {
  descResizeObserver?.disconnect();
  if (typeof ResizeObserver === 'undefined') return;

  descResizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(scheduleDescOverflowMeasure, 80);
  });
  for (const target of [cardRef.value, descWrapRef.value, descRef.value]) {
    if (target) descResizeObserver.observe(target);
  }
}

watch(
  () => [props.item.id, rawDescription.value, locale.value],
  () => {
    avatarFailed.value = false;
    scheduleDescOverflowMeasure();
  }
);

watch(
  () => [descOverflows.value, descExpanded.value],
  () => {
    auditDescOverflowAfterRender();
  }
);

onMounted(() => {
  scheduleDescOverflowMeasure();
  connectDescResizeObservers();
  unsubscribeLayoutResize = subscribeLayoutResize(scheduleDescOverflowMeasure);
});

onUnmounted(() => {
  if (measureRaf) {
    cancelAnimationFrame(measureRaf);
    measureRaf = 0;
  }
  clearTimeout(resizeDebounceTimer);
  descResizeObserver?.disconnect();
  descResizeObserver = undefined;
  unsubscribeLayoutResize?.();
  unsubscribeLayoutResize = undefined;
});

function onAvatarError() {
  avatarFailed.value = true;
}
const hasHomepage = computed(() => !!props.item.homepage);
const homepageHost = computed(() => formatHomepageHost(props.item.homepage));
const homepageHref = computed(() => {
  const url = props.item.homepage;
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
});
const createdLabel = computed(() => formatRepoDate(props.item.createdAt, locale.value));
const pushedLabel = computed(() => formatRepoDate(props.item.pushedAt, locale.value));
const showMeta = computed(
  () =>
    createdLabel.value ||
    pushedLabel.value ||
    hasHomepage.value ||
    props.item.forksCount > 0 ||
    props.item.watchersCount > 0
);
const topicList = computed(() => (Array.isArray(props.item.topics) ? props.item.topics : []).slice(0, 8));

async function toggleDesc() {
  store.toggleDescExpanded(props.item.id);
  await nextTick();
  auditDescOverflowAfterRender();
  requestStarsRowRemeasure(props.itemIndex);
}

function onTopicClick(topic) {
  applyTopicSearch(topic);
}

/** Shields 风格数值：25k / 1.2M */
function formatShieldCount(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) {
    const v = num / 1_000_000;
    const s = v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace(/\.0$/, '');
    return `${s}M`;
  }
  if (num >= 1000) {
    const v = num / 1000;
    const s = v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace(/\.0$/, '');
    return `${s}k`;
  }
  return num.toLocaleString();
}
</script>

<template>
  <article ref="cardRef" class="star-card" :id="item.id">
    <a
      v-if="ownerProfileUrl"
      class="star-card__avatar"
      :href="ownerProfileUrl"
      target="_blank"
      rel="noreferrer"
      :aria-label="t('ownerProfile', { owner })"
      :title="t('ownerProfile', { owner })"
    >
      <img
        v-if="showAvatarImg"
        class="star-card__avatar-img"
        :src="avatarSrc"
        alt=""
        width="40"
        height="40"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @error="onAvatarError"
      />
      <span v-else class="star-card__avatar-letter">{{ avatarLetter }}</span>
    </a>
    <div v-else class="star-card__avatar" aria-hidden="true">
      <span class="star-card__avatar-letter">{{ avatarLetter }}</span>
    </div>
    <div class="star-card__body">
      <div class="star-card__head">
        <h3 class="star-card__title">
          <a :href="item.url" target="_blank" rel="noreferrer">
            <span class="star-card__owner">{{ owner }}</span>
            <span class="star-card__sep">/</span>
            <span class="star-card__repo">{{ repo }}</span>
          </a>
        </h3>
        <div class="star-card__badges">
          <span
            v-if="item.forksCount > 0"
            class="star-card__shield"
            :title="`${t('forksCount')}: ${item.forksCount.toLocaleString()}`"
          >
            <span class="star-card__shield-label">{{ t('shieldFork') }}</span>
            <span class="star-card__shield-value">{{ formatShieldCount(item.forksCount) }}</span>
          </span>
          <span
            v-if="item.watchersCount > 0"
            class="star-card__shield"
            :title="`${t('watchersCount')}: ${item.watchersCount.toLocaleString()}`"
          >
            <span class="star-card__shield-label">{{ t('shieldWatch') }}</span>
            <span class="star-card__shield-value">{{ formatShieldCount(item.watchersCount) }}</span>
          </span>
          <span
            v-if="showStarsCount"
            class="star-card__shield star-card__shield--stars"
            :title="`${t('stars')}: ${item.stars.toLocaleString()}`"
          >
            <span class="star-card__shield-label">{{ t('shieldStars') }}</span>
            <span class="star-card__shield-value">{{ formatShieldCount(item.stars) }}</span>
          </span>
        </div>
      </div>

      <div ref="descWrapRef" class="star-card__desc-wrap">
        <p
          ref="descRef"
          class="star-card__desc"
          :class="{ 'is-collapsed': descOverflows && !descExpanded }"
        >
          {{ descText }}
        </p>
        <button
          v-if="descOverflows"
          type="button"
          class="star-card__desc-toggle"
          @click="toggleDesc"
        >
          {{ descExpanded ? t('descCollapse') : t('descExpand') }}
        </button>
      </div>

      <div v-if="showMeta" class="star-card__meta">
        <span v-if="createdLabel" class="star-card__meta-item">
          <span class="star-card__meta-label">{{ t('createdAt') }}</span>
          {{ createdLabel }}
        </span>
        <span v-if="pushedLabel" class="star-card__meta-item">
          <span class="star-card__meta-label">{{ t('pushedAt') }}</span>
          {{ pushedLabel }}
        </span>
        <a
          v-if="hasHomepage"
          class="star-card__meta-item star-card__meta-link"
          :href="homepageHref"
          target="_blank"
          rel="noreferrer"
          @click.stop
        >
          <span class="star-card__meta-label">{{ t('site') }}</span>
          {{ homepageHost }}
        </a>
      </div>

      <div class="star-card__foot">
        <span
          v-if="showLanguage"
          class="star-card__tag star-card__tag--lang"
          :class="langClass"
          :style="{ '--lang-accent': langAccent }"
        >
          <span class="star-card__lang-dot" />
          {{ langText }}
        </span>
        <span v-if="showLicense && hasLicense" class="star-card__tag star-card__tag--license">
          <a
            v-if="hasLicenseLink"
            :href="item.licenseUrl"
            target="_blank"
            rel="noreferrer license"
            @click.stop
          >{{ item.license }}</a>
          <span v-else>{{ item.license }}</span>
        </span>
        <span v-if="item.fork" class="star-card__tag star-card__tag--fork">{{ t('fork') }}</span>
        <button
          v-for="topic in topicList"
          :key="topic"
          type="button"
          class="star-card__tag star-card__tag--topic"
          :title="t('filterByTopic', { topic })"
          @click.stop="onTopicClick(topic)"
        >
          {{ topic }}
        </button>
      </div>
    </div>
  </article>
</template>
