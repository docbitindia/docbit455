import { useEffect } from 'react';

/**
 * DocBit is a client-rendered SPA served from a single index.html, so the
 * static <head> tags only describe the homepage. This hook keeps the
 * per-route <title>, meta description, canonical URL, robots directive, and
 * Open Graph / Twitter title+description+url in sync with whichever page is
 * actually mounted, so each crawlable route (/, /privacy, /support,
 * /documentation) reports its own accurate metadata instead of silently
 * inheriting the homepage's.
 *
 * The shared og:image / twitter:image (and the app icon) are intentionally
 * left untouched here — they're global and set once in index.html.
 */

const SITE_URL = 'https://docbit.in';

const DEFAULT_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

interface PageMetaOptions {
  title: string;
  description: string;
  /** Site-relative path, e.g. "/" or "/documentation". */
  path: string;
  /** Overrides the default indexable robots directive (e.g. for a 404 page). */
  robots?: string;
}

function setMetaByName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`
  );

  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }

  el.setAttribute('content', content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`
  );

  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }

  el.setAttribute('content', content);
}

export function usePageMeta({
  title,
  description,
  path,
  robots
}: PageMetaOptions) {
  useEffect(() => {
    const url =
      path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;

    document.title = title;

    setMetaByName('description', description);
    setMetaByName('robots', robots ?? DEFAULT_ROBOTS);

    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );

    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }

    canonical.setAttribute('href', url);

    setMetaByProperty('og:title', title);
    setMetaByProperty('og:description', description);
    setMetaByProperty('og:url', url);

    setMetaByName('twitter:title', title);
    setMetaByName('twitter:description', description);
  }, [title, description, path, robots]);
}
