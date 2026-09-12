import { useCallback, useEffect, useRef, useState } from 'react';

// 10% - 200%, per product spec. Applies uniformly across every input
// method (touch pinch, trackpad pinch, ctrl/cmd+scroll, and the on-screen
// zoom buttons) so behavior is consistent across desktop, laptop, tablet,
// and mobile (Android + iOS) browsers.
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

function distance(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Cross-device pinch/zoom for the data table.
 *
 * - Touch (mobile/tablet, Android + iOS): two-finger pinch via native
 *   (non-passive) touch listeners so preventDefault() can actually stop
 *   the browser's own page-zoom from fighting the gesture — React's
 *   synthetic touch handlers are passive by default and can't do that
 *   reliably.
 * - Trackpad pinch (macOS/Windows laptops) and ctrl/cmd + mouse wheel
 *   (desktops without touch): browsers report these as `wheel` events
 *   with `ctrlKey: true`, so a native, non-passive `wheel` listener
 *   handles both the same way.
 * - Zoom buttons / keyboard: `zoomIn`, `zoomOut`, and `setZoomClamped`
 *   are exposed so devices with neither touch nor a trackpad (a plain
 *   desktop mouse) still have a way to zoom.
 *
 * A ref mirrors the latest zoom value so the native listeners never need
 * to be torn down and re-attached on every zoom change.
 */
export function usePinchZoom<T extends HTMLElement>() {
  // Keep the gesture surface stable so focus/search changes never detach the
  // table gesture handlers. The visual zoom is applied directly to the table
  // during a gesture; React state is committed only when the gesture ends.
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const gesture = useRef<{ startDist: number; startZoom: number } | null>(null);
  const baseSize = useRef({ width: 0, height: 0 });
  const wheelCommitFrame = useRef<number | null>(null);

  const getZoomNodes = useCallback(() => {
    if (!element) return null;
    const table = element.querySelector('table') as HTMLElement | null;
    const layer = element.querySelector('[data-zoom-layer]') as HTMLElement | null;
    if (!table || !layer) return null;
    return { table, layer };
  }, [element]);

  const syncVisualZoom = useCallback((next: number) => {
    const nodes = getZoomNodes();
    if (!nodes) return;

    const { table, layer } = nodes;
    // Measure the unscaled table only when its layout changes. Reading
    // offsetWidth/offsetHeight on every pinch frame would force synchronous
    // layout and makes large tables feel heavy.
    if (baseSize.current.width === 0 || baseSize.current.height === 0) {
      baseSize.current = { width: table.offsetWidth, height: table.offsetHeight };
    }
    const { width: baseWidth, height: baseHeight } = baseSize.current;
    layer.style.width = `${Math.max(1, baseWidth * next)}px`;
    layer.style.height = `${Math.max(1, baseHeight * next)}px`;
    table.style.transformOrigin = 'top left';
    table.style.transform = `scale(${next})`;
    table.style.willChange = 'transform';
  }, [getZoomNodes]);

  const applyZoom = useCallback((next: number, commit = true) => {
    const clamped = clampZoom(next);
    zoomRef.current = clamped;
    syncVisualZoom(clamped);
    if (commit) setZoom(clamped);
  }, [syncVisualZoom]);

  useEffect(() => {
    const el = element;
    if (!el) return;

    const previousTouchAction = el.style.touchAction;
    el.style.touchAction = 'pan-x pan-y';

    const sync = () => syncVisualZoom(zoomRef.current);
    const frame = requestAnimationFrame(sync);
    const resizeObserver = new ResizeObserver(() => {
      const table = el.querySelector('table') as HTMLElement | null;
      if (!table) return;
      baseSize.current = { width: table.offsetWidth, height: table.offsetHeight };
      syncVisualZoom(zoomRef.current);
    });
    const table = el.querySelector('table');
    if (table) resizeObserver.observe(table);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        gesture.current = { startDist: distance(e.touches), startZoom: zoomRef.current };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && gesture.current) {
        e.preventDefault();
        const dist = distance(e.touches);
        if (gesture.current.startDist <= 0) return;
        const ratio = dist / gesture.current.startDist;
        // Do not set React state on every touch frame. Directly transform the
        // existing table so large datasets remain responsive while pinching.
        applyZoom(gesture.current.startZoom * ratio, false);
      }
    };

    const endGesture = (e: TouchEvent) => {
      if (e.touches.length < 2 && gesture.current) {
        const finalZoom = zoomRef.current;
        gesture.current = null;
        setZoom(finalZoom);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.01);
      // Trackpad pinch can emit a dense stream of wheel events. Update only
      // the composited transform immediately and commit React state once per
      // animation frame instead of rerendering the complete table per event.
      applyZoom(zoomRef.current * factor, false);
      if (wheelCommitFrame.current === null) {
        wheelCommitFrame.current = requestAnimationFrame(() => {
          wheelCommitFrame.current = null;
          setZoom(zoomRef.current);
        });
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endGesture, { passive: true });
    el.addEventListener('touchcancel', endGesture, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      if (wheelCommitFrame.current !== null) {
        cancelAnimationFrame(wheelCommitFrame.current);
        wheelCommitFrame.current = null;
      }
      resizeObserver.disconnect();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', endGesture);
      el.removeEventListener('touchcancel', endGesture);
      el.removeEventListener('wheel', onWheel);
      el.style.touchAction = previousTouchAction;
    };
  }, [applyZoom, element, syncVisualZoom]);

  // Re-apply the committed value after React renders a new table (for
  // example after search/filter changes or editing a cell).
  useEffect(() => {
    if (element) syncVisualZoom(zoomRef.current);
  }, [element, zoom, syncVisualZoom]);

  const reset = useCallback(() => applyZoom(1), [applyZoom]);
  const zoomIn = useCallback(() => applyZoom(zoomRef.current + ZOOM_STEP), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(zoomRef.current - ZOOM_STEP), [applyZoom]);
  const setZoomClamped = useCallback((next: number) => applyZoom(next), [applyZoom]);

  return {
    ref,
    zoom,
    resetZoom: reset,
    zoomIn,
    zoomOut,
    setZoom: setZoomClamped,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM
  };
}
