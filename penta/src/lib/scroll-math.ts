export type Layer = 1 | 2 | 3;

const dropSegments = [
  [0.04, 0.28],
  [0.36, 0.6],
  [0.68, 0.92],
] as const;

const layerMidpoints = [0.22, 0.54, 0.86] as const;

export function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function stackProgress(stackTop: number, stackHeight: number, stageHeight: number): number {
  return clamp01(-stackTop / Math.max(1, stackHeight - stageHeight));
}

export function plateDrop(progress: number, layer: Layer, reducedMotion: boolean): number {
  const [start, end] = dropSegments[layer - 1];
  const t = clamp01((progress - start) / (end - start));
  if (reducedMotion) return t > 0 ? 1 : 0;
  return easeOutCubic(t);
}

export function activeLayer(progress: number): Layer {
  if (progress < 0.33) return 1;
  return progress < 0.66 ? 2 : 3;
}

export function coverProgress(nextPanelTop: number, stageHeight: number): number {
  return clamp01(1 - nextPanelTop / Math.max(1, stageHeight));
}

export function heroProgress(heroTop: number, heroHeight: number): number {
  return clamp01(-heroTop / Math.max(1, heroHeight));
}

export function layerScrollTop(
  scrollTop: number,
  stackTop: number,
  stackHeight: number,
  stageHeight: number,
  layer: Layer,
): number {
  return scrollTop + stackTop + layerMidpoints[layer - 1] * (stackHeight - stageHeight);
}

export function scrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}
