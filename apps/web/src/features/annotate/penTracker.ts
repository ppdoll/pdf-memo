/**
 * 손바닥 무시(palm rejection)용 전역 펜 상태.
 * 펜이 닿아 있거나 막 떨어진 직후의 터치는 그리기·이동 어느 쪽에도 쓰지 않는다.
 */
const PALM_WINDOW_MS = 400;

let activePens = 0;
let lastPenUp = -Infinity;

export const penTracker = {
  down(): void {
    activePens += 1;
  },
  up(): void {
    activePens = Math.max(0, activePens - 1);
    lastPenUp = performance.now();
  },
  isPalmWindow(): boolean {
    return activePens > 0 || performance.now() - lastPenUp < PALM_WINDOW_MS;
  },
};
