import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react';

/**
 * Minimal pathname-based router.
 *
 * Routes:
 * /
 * /workspace
 * /documentation
 * /support
 * /privacy
 *
 * Handles:
 * - Client-side navigation
 * - Browser back/forward
 * - Static prerendering
 * - Scroll-to-top on new page navigation
 */

const StaticPathContext =
  createContext<string | null>(null);

/* ================================================================
   STATIC PATH PROVIDER
   ================================================================ */

export function StaticPathProvider({
  path,
  children
}: {
  path: string;
  children: ReactNode;
}) {
  return (
    <StaticPathContext.Provider
      value={path}
    >
      {children}
    </StaticPathContext.Provider>
  );
}

/* ================================================================
   PATH HELPERS
   ================================================================ */

function normalizePath(
  path: string
): string {
  if (!path) {
    return '/';
  }

  const pathname =
    path.split('?')[0].split('#')[0];

  return (
    pathname.replace(/\/+$/, '') || '/'
  );
}

function getPath(): string {
  if (
    typeof window === 'undefined'
  ) {
    return '/';
  }

  return normalizePath(
    window.location.pathname
  );
}

/* ================================================================
   SCROLL
   ================================================================ */

function scrollToTop() {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  /*
   * Use the next animation frame so React has
   * an opportunity to render the new route first.
   */
  window.requestAnimationFrame(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    });
  });
}

/* ================================================================
   NAVIGATION
   ================================================================ */

export function navigate(
  path: string
) {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  const nextPath =
    normalizePath(path);

  const currentPath =
    getPath();

  if (
    currentPath === nextPath
  ) {
    /*
     * Even when the user clicks the current
     * page link, return them to the top.
     *
     * Example:
     * Homepage bottom → click Home → top.
     */
    scrollToTop();
    return;
  }

  /*
   * Disable browser automatic scroll restoration
   * for our SPA navigation.
   */
  if (
    'scrollRestoration' in
    window.history
  ) {
    window.history.scrollRestoration =
      'manual';
  }

  window.history.pushState(
    {},
    '',
    nextPath
  );

  /*
   * Tell React that the route changed.
   */
  window.dispatchEvent(
    new PopStateEvent('popstate')
  );

  /*
   * Always start a newly opened internal page
   * from the top.
   */
  scrollToTop();
}

/* ================================================================
   ROUTE HOOK
   ================================================================ */

export function useRoute(): [
  string,
  (path: string) => void
] {
  const staticPath =
    useContext(
      StaticPathContext
    );

  const [
    path,
    setPath
  ] = useState(
    staticPath ??
      getPath()
  );

  useEffect(() => {
    /*
     * Nothing browser-specific is needed
     * during static prerendering.
     */
    if (
      typeof window === 'undefined'
    ) {
      return;
    }

    /*
     * Keep SPA navigation from automatically
     * restoring the previous scroll position.
     */
    if (
      'scrollRestoration' in
      window.history
    ) {
      window.history.scrollRestoration =
        'manual';
    }

    const handlePopState =
      () => {
        const nextPath =
          getPath();

        setPath(nextPath);

        /*
         * Back/forward navigation should also
         * open the destination from the top.
         */
        scrollToTop();
      };

    window.addEventListener(
      'popstate',
      handlePopState
    );

    return () => {
      window.removeEventListener(
        'popstate',
        handlePopState
      );
    };
  }, []);

  const go =
    useCallback(
      (nextPath: string) => {
        navigate(nextPath);
      },
      []
    );

  return [
    path,
    go
  ];
}

/* ================================================================
   LINK HANDLER
   ================================================================ */

/**
 * Anchor-like click handler for
 * internal SPA navigation.
 *
 * Modifier clicks are preserved so users
 * can still:
 * - Ctrl/Cmd + click
 * - Shift + click
 * - Alt + click
 * - Middle-click
 *
 * as normal browser navigation.
 */
export function linkHandler(
  path: string
) {
  return (
    e: MouseEvent
  ) => {
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return;
    }

    e.preventDefault();

    navigate(path);
  };
}