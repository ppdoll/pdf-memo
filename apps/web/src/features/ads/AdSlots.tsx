import { useState } from 'react';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { KakaoAd } from './KakaoAd';
import { AD_UNITS } from './units';

/** PC 왼쪽 세로 배너 자리. 넓은 화면(1280px 이상)에서만 광고를 불러오고, 채워지기 전엔 폭 0 */
export function LeftRailAd() {
  const wide = useMediaQuery('(min-width: 1280px)');
  const [filled, setFilled] = useState(false);
  if (!wide) return null;
  return (
    <aside
      className={`hidden shrink-0 xl:block ${filled ? 'w-[160px]' : 'w-0 overflow-hidden'}`}
      aria-label="광고"
      data-ad-slot="pc-left"
      data-ad-filled={filled}
    >
      <div className="sticky top-6">
        <KakaoAd {...AD_UNITS.pcLeft} onFillChange={setFilled} />
      </div>
    </aside>
  );
}

interface MobileBannerAdProps {
  onFillChange?: (filled: boolean) => void;
}

/** 모바일 하단 띠 배너 (768px 미만). 채워지면 화면 아래에 고정되고 본문에 여백을 준다 */
export function MobileBannerAd({ onFillChange }: MobileBannerAdProps) {
  const mobile = useMediaQuery('(max-width: 767px)');
  const [filled, setFilled] = useState(false);
  if (!mobile) return null;
  const handleFill = (value: boolean) => {
    setFilled(value);
    onFillChange?.(value);
  };
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-slate-200 bg-white/95 backdrop-blur ${
        filled ? 'py-1' : 'h-0 overflow-hidden border-0'
      }`}
      style={{ paddingBottom: filled ? 'env(safe-area-inset-bottom)' : undefined }}
      aria-label="광고"
      data-ad-slot="mobile-banner"
      data-ad-filled={filled}
    >
      <KakaoAd {...AD_UNITS.mobileBanner} onFillChange={handleFill} />
    </div>
  );
}
