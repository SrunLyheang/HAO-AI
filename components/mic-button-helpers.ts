// Pure decision points extracted from MicButton so they're testable without a
// DOM/canvas. See test/mic-button-helpers.test.ts and ui-context.md's
// "Mic button and ring" section for the constants' origin.

const MIS_TAP_THRESHOLD_MS = 320;
const LEVEL_SMOOTHING = 0.28;

export function isMisTap(holdMs: number): boolean {
  return holdMs < MIS_TAP_THRESHOLD_MS;
}

export function smoothLevel(current: number, target: number): number {
  return current + (target - current) * LEVEL_SMOOTHING;
}
