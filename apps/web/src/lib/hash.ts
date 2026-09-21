/** PDF 바이트의 내용 해시. 중복 가져오기 감지와 PdfBlob 키에 사용한다 */
export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const buffer =
    data instanceof Blob ? await data.arrayBuffer() : data instanceof Uint8Array ? data : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
