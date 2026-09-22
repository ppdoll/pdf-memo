import type { CSSProperties } from 'react';
import type { StickerDef } from './pack';

interface StickerGraphicProps {
  def: StickerDef;
  /** 'none'이면 상자를 꽉 채우고(객체는 비율이 고정돼 있어 왜곡되지 않음), 'meet'은 썸네일용 */
  fit?: 'none' | 'meet';
  className?: string;
  style?: CSSProperties;
}

/** 내장 스티커를 인라인 SVG로 그린다. 내보내기(drawSvgPath)와 같은 path 데이터를 쓴다 */
export function StickerGraphic({ def, fit = 'none', className, style }: StickerGraphicProps) {
  return (
    <svg
      viewBox={`0 0 ${def.width} ${def.height}`}
      preserveAspectRatio={fit === 'meet' ? 'xMidYMid meet' : 'none'}
      width="100%"
      height="100%"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {def.shapes.map((shape, index) => (
        <path
          key={index}
          d={shape.d}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke ?? 'none'}
          strokeWidth={shape.strokeWidth}
          strokeLinecap={shape.lineCap ?? 'butt'}
          strokeLinejoin="round"
          opacity={shape.opacity}
        />
      ))}
    </svg>
  );
}
