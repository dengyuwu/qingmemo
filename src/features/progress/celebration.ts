import confetti from 'canvas-confetti';

export function fireBattleConfetti(intense = false) {
  const particleCount = intense ? 120 : 64;
  const spread = intense ? 82 : 58;
  void confetti({
    particleCount,
    spread,
    origin: { y: 0.72 },
    scalar: intense ? 1.05 : 0.88,
    colors: ['#38bdf8', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'],
  });
}
