/** 카카오 애드핏 광고 단위. 라이브러리 화면에만 붙이고 뷰어(필기 화면)에는 넣지 않는다 */

export interface AdUnit {
  unit: string;
  width: number;
  height: number;
}

export const AD_UNITS = {
  /** PC 왼쪽 세로 배너 */
  pcLeft: { unit: 'DAN-sdrkiSMOzaCvakky', width: 160, height: 600 },
  /** 모바일 하단 띠 배너 */
  mobileBanner: { unit: 'DAN-FNN4ziHXbSQ0rrab', width: 320, height: 50 },
} as const satisfies Record<string, AdUnit>;

export const ADFIT_SCRIPT_URL = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
