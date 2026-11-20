"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  activeLayer,
  coverProgress,
  heroProgress,
  layerScrollTop,
  plateDrop,
  scrollBehavior,
  stackProgress,
  type Layer,
} from "@/lib/scroll-math";

export const pinnedPanelsQuery = "(min-width: 761px) and (min-height: 561px)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const layers: Layer[] = [1, 2, 3];

type LayerStore = {
  subscribe: (listener: () => void) => () => void;
  get: () => Layer;
  set: (layer: Layer) => void;
};

function createLayerStore(): LayerStore {
  let current: Layer = 3;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => current,
    set(layer) {
      if (layer === current) return;
      current = layer;
      listeners.forEach((listener) => listener());
    },
  };
}

function createWriter() {
  const written = new Map<string, string>();
  return (element: HTMLElement, name: string, value: number) => {
    const text = value.toFixed(4);
    const key = `${element.dataset.landing}:${name}`;
    if (written.get(key) === text) return;
    written.set(key, text);
    element.style.setProperty(name, text);
  };
}

function find(root: HTMLElement, part: string) {
  return root.querySelector<HTMLElement>(`[data-landing="${part}"]`);
}

function startScrollLoop(root: HTMLElement, setLayer: (layer: Layer) => void) {
  const hero = find(root, "hero");
  const stack = find(root, "stack");
  const stage = find(root, "stage");
  const panels = find(root, "panels");
  const panelList = Array.from(root.querySelectorAll<HTMLElement>("[data-landing-panel]"));
  const reducedMotion = window.matchMedia(reducedMotionQuery);
  const pinnedPanels = window.matchMedia(pinnedPanelsQuery);
  const write = createWriter();
  let frame = 0;

  function update() {
    frame = 0;
    const stageHeight = stage?.offsetHeight ?? 0;
    const stackTop = stack?.getBoundingClientRect().top ?? 0;
    const stackHeight = stack?.offsetHeight ?? 0;
    const panelTops = panelList.map((panel) => panel.getBoundingClientRect().top);
    const heroRect = hero?.getBoundingClientRect();
    const still = reducedMotion.matches;

    if (stack && stage) {
      const progress = stackProgress(stackTop, stackHeight, stageHeight);
      layers.forEach((layer) => write(stack, `--d${layer}`, plateDrop(progress, layer, still)));
      setLayer(activeLayer(progress));
    }

    if (panels) {
      const covers = still || !pinnedPanels.matches;
      panelTops.slice(1).forEach((top, index) => {
        write(panels, `--c${index + 1}`, covers ? 0 : coverProgress(top, stageHeight));
      });
    }

    if (hero && heroRect) write(hero, "--h", still ? 0 : heroProgress(heroRect.top, heroRect.height));
    root.dataset.ready = "true";
  }

  function schedule() {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  }

  function revealFocusedPanel(event: FocusEvent) {
    if (!pinnedPanels.matches || !panels || !(event.target instanceof Element)) return;
    const index = panelList.findIndex((panel) => panel.contains(event.target as Element));
    const next = panelList[index + 1];
    if (index < 0 || !next) return;
    const stageHeight = stage?.offsetHeight ?? window.innerHeight;
    if (next.getBoundingClientRect().top >= stageHeight) return;
    const panelsTop = panels.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: panelsTop + index * stageHeight, behavior: "auto" });
  }

  const resizes = new ResizeObserver(schedule);
  resizes.observe(root);
  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule);
  reducedMotion.addEventListener("change", schedule);
  pinnedPanels.addEventListener("change", schedule);
  panels?.addEventListener("focusin", revealFocusedPanel);
  update();

  return () => {
    resizes.disconnect();
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", schedule);
    reducedMotion.removeEventListener("change", schedule);
    pinnedPanels.removeEventListener("change", schedule);
    panels?.removeEventListener("focusin", revealFocusedPanel);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

function scrollToLayer(root: HTMLElement, layer: Layer) {
  const stack = find(root, "stack");
  const stage = find(root, "stage");
  if (!stack || !stage) return;
  const top = layerScrollTop(
    window.scrollY,
    stack.getBoundingClientRect().top,
    stack.offsetHeight,
    stage.offsetHeight,
    layer,
  );
  const still = window.matchMedia(reducedMotionQuery).matches;
  window.scrollTo({ top, behavior: scrollBehavior(still) });
}

export function useLandingScroll(rootRef: RefObject<HTMLElement | null>) {
  const [store] = useState(createLayerStore);

  useEffect(() => {
    if (!rootRef.current) return;
    return startScrollLoop(rootRef.current, store.set);
  }, [rootRef, store]);

  const goToLayer = useCallback(
    (layer: Layer) => {
      if (rootRef.current) scrollToLayer(rootRef.current, layer);
    },
    [rootRef],
  );

  return useMemo(
    () => ({ subscribe: store.subscribe, getLayer: store.get, goToLayer }),
    [store, goToLayer],
  );
}
