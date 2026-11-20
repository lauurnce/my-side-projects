"use client";

import { createContext, use, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Layer } from "@/lib/scroll-math";
import { useLandingScroll } from "./useLandingScroll";
import styles from "./ScrollStage.module.css";

type LandingScroll = ReturnType<typeof useLandingScroll>;

const LandingScrollContext = createContext<LandingScroll | null>(null);

const restingLayer: Layer = 3;

function useLandingScrollContext() {
  const scroll = use(LandingScrollContext);
  if (!scroll) throw new Error("This component must be inside ScrollStage");
  return scroll;
}

export function useActiveLayer(): Layer {
  const scroll = useLandingScrollContext();
  return useSyncExternalStore(scroll.subscribe, scroll.getLayer, () => restingLayer);
}

export function useGoToLayer() {
  return useLandingScrollContext().goToLayer;
}

export function ScrollStage({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scroll = useLandingScroll(rootRef);

  return (
    <LandingScrollContext value={scroll}>
      <div ref={rootRef} className={styles.root}>
        {children}
      </div>
    </LandingScrollContext>
  );
}
