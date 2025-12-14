<script setup lang="ts">
const topRow = [
  {
    alt: 'CI',
    href: 'https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml',
    src: 'https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml/badge.svg',
  },
  {
    alt: 'Coverage',
    href: 'https://codecov.io/gh/kasperrt/wiretyped',
    src: 'https://codecov.io/gh/kasperrt/wiretyped/branch/main/graph/badge.svg',
  },
  {
    alt: 'minzip',
    href: 'https://bundlejs.com/?q=wiretyped@latest',
    src: 'https://deno.bundlejs.com/badge?q=wiretyped@latest',
  },
] as const;

const bottomRow = [
  {
    alt: 'npm',
    href: 'https://www.npmjs.com/package/wiretyped',
    src: 'https://img.shields.io/npm/v/wiretyped.svg',
  },
  {
    alt: 'JSR',
    href: 'https://jsr.io/@kasperrt/wiretyped',
    src: 'https://jsr.io/badges/@kasperrt/wiretyped',
  },
] as const;
</script>

<template>
  <div class="wt-hero-badges-wrap" aria-label="Project badges">
    <p class="wt-hero-badges-intro">
      We have a cool lil' guy mascot, just look at how happy he is. Also we got these badges. They’re flashy and
      clickable.
    </p>
    <div class="wt-hero-badges-row">
      <a
        v-for="badge in topRow"
        :key="badge.alt"
        class="wt-hero-badge"
        :href="badge.href"
        target="_blank"
        rel="noreferrer"
      >
        <img :src="badge.src" :alt="badge.alt" loading="lazy" decoding="async" />
      </a>
    </div>
    <div class="wt-hero-badges-row wt-hero-badges-row--bottom">
      <a
        v-for="badge in bottomRow"
        :key="badge.alt"
        class="wt-hero-badge"
        :href="badge.href"
        target="_blank"
        rel="noreferrer"
      >
        <img :src="badge.src" :alt="badge.alt" loading="lazy" decoding="async" />
      </a>
    </div>
  </div>
</template>
