/** 이미지 파일 판별과 이름 규칙. 변환기(imagesToPdf)는 필요할 때 동적으로 불러온다 */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;
const HEIC_EXT = /\.hei[cf]$/i;

export function isImageFile(file: File): boolean {
  return /^image\//i.test(file.type) || IMAGE_EXT.test(file.name);
}

/** 브라우저가 디코딩하지 못하는 아이폰 HEIC/HEIF */
export function isHeicFile(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || HEIC_EXT.test(file.name);
}

export const HEIC_MESSAGE =
  'HEIC 사진은 브라우저가 열 수 없습니다. 아이폰 설정 > 카메라 > 포맷을 "높은 호환성"으로 바꾸거나, 사진 앱에서 JPEG로 내보낸 뒤 넣어 주세요';

export function baseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return base.length > 0 ? base.slice(0, 280) : '이미지';
}

/** 문서 제목: 한 장이면 파일 이름, 여러 장이면 "첫 이름 외 N장" */
export function imagesTitle(files: readonly File[]): string {
  const first = baseName(files[0]?.name ?? '');
  return files.length > 1 ? `${first} 외 ${files.length - 1}장` : first;
}
