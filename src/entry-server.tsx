import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App';
import { ToastProvider } from './hooks/useToast';
import { StaticPathProvider } from './router/useRoute';
import { PAGE_META, NOT_FOUND_META } from './seo/pageMeta';

export { PAGE_META, NOT_FOUND_META };

/**
 * Renders the app for a single route to a static HTML string, for the
 * build-time prerender step (scripts/prerender.mjs). This intentionally
 * mirrors the provider tree in main.tsx (ToastProvider wraps App) so the
 * server-rendered markup matches what the client renders on top of it.
 *
 * Only used at build time in Node — this module (and react-dom/server)
 * never ships to the browser.
 */
export function renderPage(path: string): string {
  return renderToStaticMarkup(
    <StaticPathProvider path={path}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StaticPathProvider>
  );
}
