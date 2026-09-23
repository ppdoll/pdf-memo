import { useEffect, useRef, useState } from 'react';
import { ADFIT_SCRIPT_URL, type AdUnit } from './units';

interface KakaoAdProps extends AdUnit {
  className?: string;
  /** 광고가 실제로 채워졌는지 알려 준다 (빈 자리를 숨기는 데 쓴다) */
  onFillChange?: (filled: boolean) => void;
}

interface AdfitGlobal {
  adfit?: { destroy?: (unit: string) => void };
}

/**
 * 카카오 애드핏 한 칸. 애드핏 스크립트는 문서 안의 <ins class="kakao_ad_area">를 찾아 채우므로
 * 마운트할 때마다 스크립트를 다시 붙여 새 칸을 인식시키고, 언마운트하면 정리한다.
 * 채워지기 전까지는 <ins>가 display:none 이라(애드핏 규약) 자리를 차지하지 않는다.
 */
export function KakaoAd({ unit, width, height, className = '', onFillChange }: KakaoAdProps) {
  const insRef = useRef<HTMLModElement>(null);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return;
    const check = () => setFilled(ins.style.display !== 'none' || ins.childElementCount > 0);
    const observer = new MutationObserver(check);
    observer.observe(ins, { attributes: true, attributeFilter: ['style'], childList: true });

    const script = document.createElement('script');
    script.src = ADFIT_SCRIPT_URL;
    script.async = true;
    script.dataset.adfitFor = unit;
    ins.insertAdjacentElement('afterend', script);

    return () => {
      observer.disconnect();
      script.remove();
      try {
        (window as unknown as AdfitGlobal).adfit?.destroy?.(unit);
      } catch {
        /* 애드핏 버전에 따라 destroy가 없을 수 있다 */
      }
    };
  }, [unit]);

  useEffect(() => {
    onFillChange?.(filled);
  }, [filled, onFillChange]);

  return (
    <div className={className} data-ad-unit-wrapper={unit} data-ad-filled={filled}>
      <ins
        ref={insRef}
        className="kakao_ad_area"
        style={{ display: 'none' }}
        data-ad-unit={unit}
        data-ad-width={width}
        data-ad-height={height}
      />
    </div>
  );
}
