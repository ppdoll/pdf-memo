import type { ImageObject } from '@pdf-memo/shared';
import { useRef, useState, type ReactNode } from 'react';
import { storage } from '../../storage';
import type { AnnotationSession } from '../annotate/session';
import { useToolStore } from '../annotate/toolStore';
import { useSelectedObject } from '../text/hooks';
import { useSelectionStore } from '../text/selectionStore';
import {
  importUserImage,
  packStickerOf,
  stickerRefForAsset,
  stickerRefForPack,
  useAssetUrl,
  useUserImages,
} from './assets';
import { STICKER_OPACITIES, withImageGeometry, type StickerRef } from './model';
import { STICKER_CATEGORIES, STICKER_PACK } from './pack';
import { StickerGraphic } from './StickerGraphic';

const chip = 'rounded-md px-2 py-1 text-xs transition';
const active = 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-400';
const idle = 'text-slate-700 hover:bg-slate-100';

/** 스티커 도구 패널: 최근 · 내장 팩 · 내 이미지. 고른 뒤 페이지를 탭하면 붙는다 */
export function StickerPicker() {
  const activeRef = useToolStore((s) => s.sticker.active);
  const recent = useToolStore((s) => s.sticker.recent);
  const setSticker = useToolStore((s) => s.setSticker);
  const { images, refresh } = useUserImages(storage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function choose(ref: StickerRef) {
    setSticker(activeRef?.assetId === ref.assetId ? null : ref);
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let last: StickerRef | null = null;
      for (const file of Array.from(files)) {
        try {
          const asset = await importUserImage(storage, file);
          last = stickerRefForAsset(asset);
        } catch (e) {
          setError(e instanceof Error ? e.message : '이미지를 추가할 수 없습니다');
        }
      }
      await refresh();
      if (last) setSticker(last);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const activeName = activeRef ? (packStickerOf(activeRef.assetId)?.name ?? '내 이미지') : null;

  return (
    <div
      className="border-b border-slate-200 bg-white px-2 py-2 text-sm sm:px-3"
      data-sticker-picker
      aria-label="스티커 고르기"
    >
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
        {recent.length > 0 && (
          <Group label="최근">
            {recent.map((ref) => (
              <StickerButton
                key={ref.assetId}
                sticker={ref}
                pressed={activeRef?.assetId === ref.assetId}
                onClick={() => choose(ref)}
              />
            ))}
          </Group>
        )}
        {STICKER_CATEGORIES.map((category) => (
          <Group key={category.id} label={category.label}>
            {STICKER_PACK.filter((s) => s.category === category.id).map((def) => {
              const ref = stickerRefForPack(def);
              return (
                <StickerButton
                  key={def.id}
                  sticker={ref}
                  title={def.name}
                  pressed={activeRef?.assetId === def.id}
                  onClick={() => choose(ref)}
                />
              );
            })}
          </Group>
        ))}
        <Group label="내 이미지">
          {images.map((asset) => {
            const ref = stickerRefForAsset(asset);
            return (
              <StickerButton
                key={asset.id}
                sticker={ref}
                title="내 이미지"
                pressed={activeRef?.assetId === asset.id}
                onClick={() => choose(ref)}
              />
            );
          })}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex h-9 items-center rounded-md border border-dashed border-slate-400 px-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="PNG·JPEG·WebP 이미지를 스티커로 추가"
          >
            {busy ? '추가 중…' : '+ 이미지 추가'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
            data-sticker-file-input
          />
        </Group>
      </div>
      <p className="mt-1.5 text-xs text-slate-500" aria-live="polite">
        {activeName
          ? `"${activeName}" 선택됨 — 페이지를 탭하면 붙어요. 붙인 스티커는 끌어서 옮기고 핸들로 크기·회전을 바꿉니다`
          : '스티커를 고른 뒤 페이지를 탭하면 붙어요'}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-0.5 text-xs text-slate-500">{label}</span>
      <div className="flex flex-wrap items-center gap-0.5">{children}</div>
    </div>
  );
}

interface StickerButtonProps {
  sticker: StickerRef;
  pressed: boolean;
  onClick: () => void;
  title?: string;
}

function StickerButton({ sticker, pressed, onClick, title }: StickerButtonProps) {
  const def = packStickerOf(sticker.assetId);
  const url = useAssetUrl(storage, sticker.assetId);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-md p-1 transition ${
        pressed ? 'bg-indigo-50 ring-2 ring-indigo-400' : 'hover:bg-slate-100'
      }`}
      title={title ?? def?.name}
      aria-pressed={pressed}
      data-sticker-asset={sticker.assetId}
    >
      {def ? (
        <StickerGraphic def={def} fit="meet" />
      ) : url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
      ) : (
        <span className="h-full w-full rounded bg-slate-200" />
      )}
    </button>
  );
}

/** 선택한 스티커의 불투명도·회전·삭제. 툴바에 붙는다 */
export function StickerControls({ session }: { session: AnnotationSession }) {
  const target = useSelectedObject(session);
  const select = useSelectionStore((s) => s.select);
  const image = target?.type === 'image' ? (target as ImageObject) : null;
  if (!image) return null;

  function update(label: string, after: ImageObject) {
    if (!image) return;
    session.commit(label, [{ kind: 'update', before: image, after }]);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-sticker-controls>
      <div className="flex items-center gap-0.5" aria-label="불투명도">
        {STICKER_OPACITIES.map((opacity) => (
          <button
            key={opacity}
            type="button"
            onClick={() => update('불투명도', { ...image, opacity })}
            className={`${chip} ${image.opacity === opacity ? active : idle}`}
            aria-pressed={image.opacity === opacity}
          >
            {Math.round(opacity * 100)}%
          </button>
        ))}
      </div>
      {image.rotation !== 0 && (
        <button
          type="button"
          onClick={() =>
            update(
              '회전 초기화',
              withImageGeometry(image, { rotation: 0 }, { w: Infinity, h: Infinity, rotation: 0 }),
            )
          }
          className={`${chip} ${idle}`}
          title="회전을 0도로"
        >
          회전 초기화
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          session.commit('삭제', [{ kind: 'remove', object: image }]);
          select(null);
        }}
        className={`${chip} text-red-600 hover:bg-red-50`}
        title="선택한 스티커 삭제 (Delete)"
      >
        삭제
      </button>
    </div>
  );
}
