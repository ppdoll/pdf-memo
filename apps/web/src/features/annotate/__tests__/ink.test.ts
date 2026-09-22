import { describe, expect, it } from 'vitest';
import {
  TOOL_PROFILES,
  inkOutline,
  inkStrokeOptions,
  needsSimulatedPressure,
  pointsToTriples,
  type InkLike,
} from '../ink';

function ink(points: number[], tool: InkLike['tool'] = 'pen'): InkLike {
  const profile = TOOL_PROFILES[tool];
  return {
    tool,
    color: '#000000',
    opacity: profile.opacity,
    width: 4,
    points,
    smoothing: {
      thinning: profile.thinning,
      smoothing: profile.smoothing,
      streamline: profile.streamline,
    },
  };
}

describe('pressure handling', () => {
  it('simulates pressure when every sample is (nearly) the same', () => {
    expect(needsSimulatedPressure([0, 0, 0.5, 5, 5, 0.5, 9, 9, 0.5])).toBe(true);
    expect(needsSimulatedPressure([0, 0, 0.2, 5, 5, 0.6, 9, 9, 0.9])).toBe(false);
    expect(needsSimulatedPressure([])).toBe(true);
  });

  it('groups the flat array into [x, y, pressure] triples and drops a trailing partial', () => {
    expect(pointsToTriples([1, 2, 0.3, 4, 5, 0.6, 7])).toEqual([
      [1, 2, 0.3],
      [4, 5, 0.6],
    ]);
  });
});

describe('outline', () => {
  it('produces a closed polygon for a stroke and a dot for a single point', () => {
    const outline = inkOutline(ink([0, 0, 0.5, 20, 0, 0.6, 40, 10, 0.7]));
    expect(outline.length).toBeGreaterThan(3);
    for (const [x, y] of outline) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
    const dot = inkOutline(ink([10, 10, 0.5]));
    expect(dot.length).toBeGreaterThan(3);
    expect(inkOutline(ink([]))).toEqual([]);
  });

  it('keeps highlighter width uniform (no thinning) and pen pressure-sensitive', () => {
    const highlighter = inkStrokeOptions(ink([0, 0, 0.5, 10, 0, 0.5], 'highlighter'));
    expect(highlighter.thinning).toBe(0);
    expect(highlighter.size).toBe(4);
    const pen = inkStrokeOptions(ink([0, 0, 0.2, 10, 0, 0.9]));
    expect(pen.thinning).toBeGreaterThan(0);
    expect(pen.simulatePressure).toBe(false);
  });
});
