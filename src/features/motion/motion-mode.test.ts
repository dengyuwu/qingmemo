import { describe, expect, it } from 'vitest';
import { motionModeLabel, nextMotionMode, shouldLoopMotion } from './motion-mode';

describe('motion mode', () => {
  it('makes calm mode a real low-motion state', () => {
    expect(shouldLoopMotion('calm')).toBe(false);
    expect(shouldLoopMotion('lively')).toBe(true);
    expect(shouldLoopMotion('wild')).toBe(true);
  });

  it('cycles through visible motion labels', () => {
    expect(motionModeLabel('calm')).toBe('安静');
    expect(motionModeLabel('lively')).toBe('活力');
    expect(motionModeLabel('wild')).toBe('炫酷');
    expect(nextMotionMode('calm')).toBe('lively');
    expect(nextMotionMode('lively')).toBe('wild');
    expect(nextMotionMode('wild')).toBe('calm');
  });
});
