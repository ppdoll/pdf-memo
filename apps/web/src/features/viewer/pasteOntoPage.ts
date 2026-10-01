import type { AnnotationObject, PageSize } from '@pdf-memo/shared';
import type { AnnotationSession } from '../annotate/session';
import { useToolStore } from '../annotate/toolStore';
import type { Storage } from '../../storage/ports';
import { importUserImage, stickerRefForAsset } from '../sticker/assets';
import { createImageObject } from '../sticker/model';
import { createTextMeasurer, ensureTextFont } from '../text/font';
import { useSelectionStore } from '../text/selectionStore';
import { createPastedTextObject } from './pasteObjects';

export interface PasteOntoPageInput {
  storage: Storage;
  session: AnnotationSession;
  pageIndex: number;
  pageSize: PageSize;
  /** 클립보드의 이미지 파일(스크린샷). 있으면 글보다 먼저 쓴다 */
  images: File[];
  text: string;
}

/**
 * 뷰어에서 Ctrl+V: 이미지는 스티커로, 글은 텍스트 상자로 현재 페이지 가운데에 놓고 선택한다.
 * 만든 객체를 돌려주고, 붙일 것이 없으면 null.
 */
export async function pasteOntoPage(input: PasteOntoPageInput): Promise<AnnotationObject | null> {
  const { storage, session, pageIndex, pageSize, images, text } = input;
  const selection = useSelectionStore.getState();
  const center = { x: pageSize.w / 2, y: pageSize.h / 2 };

  if (images.length > 0) {
    const asset = await importUserImage(storage, images[0]);
    const image = createImageObject(
      session.documentId,
      pageIndex,
      session.nextZ(pageIndex),
      center,
      stickerRefForAsset(asset),
      pageSize,
    );
    session.commit('붙여넣기', [{ kind: 'add', object: image }]);
    selection.select({ pageIndex, id: image.id });
    return image;
  }

  await ensureTextFont();
  const defaults = useToolStore.getState().text;
  const object = createPastedTextObject(
    session.documentId,
    pageIndex,
    session.nextZ(pageIndex),
    text,
    pageSize,
    defaults,
    createTextMeasurer(defaults.fontSize),
  );
  if (!object) return null;
  session.commit('붙여넣기', [{ kind: 'add', object }]);
  selection.select({ pageIndex, id: object.id });
  return object;
}
