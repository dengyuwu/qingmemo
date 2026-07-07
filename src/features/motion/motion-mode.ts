export type MotionMode = 'calm' | 'lively' | 'wild';

export function shouldLoopMotion(mode: MotionMode): boolean {
  return mode !== 'calm';
}

export function nextMotionMode(mode: MotionMode): MotionMode {
  if (mode === 'calm') return 'lively';
  if (mode === 'lively') return 'wild';
  return 'calm';
}

export function motionModeLabel(mode: MotionMode): string {
  if (mode === 'calm') return '安静';
  if (mode === 'lively') return '活力';
  return '炫酷';
}
