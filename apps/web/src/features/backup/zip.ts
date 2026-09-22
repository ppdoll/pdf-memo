import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8 } from 'fflate';

type ArrayBufferBytes = Uint8Array<ArrayBuffer>;

/**
 * fflate 스트리밍 Zip 래퍼. 항목을 하나씩 밀어 넣어 큰 PDF를 동시에 메모리에 올리지 않는다.
 * JSON은 deflate, PDF·이미지처럼 이미 압축된 바이너리는 그대로(store) 넣는다.
 */
export class ZipWriter {
  private readonly zip: Zip;
  private readonly chunks: ArrayBufferBytes[] = [];
  private readonly finished: Promise<void>;

  constructor() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    this.finished = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.zip = new Zip((error, data, final) => {
      if (error) {
        reject(error);
        return;
      }
      this.chunks.push(data as ArrayBufferBytes);
      if (final) resolve();
    });
  }

  addText(name: string, text: string): void {
    const entry = new ZipDeflate(name, { level: 6 });
    this.zip.add(entry);
    entry.push(strToU8(text), true);
  }

  addJson(name: string, value: unknown): void {
    this.addText(name, JSON.stringify(value));
  }

  addBytes(name: string, bytes: Uint8Array, compress = false): void {
    const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    this.zip.add(entry);
    entry.push(bytes, true);
  }

  async finish(mime = 'application/zip'): Promise<Blob> {
    this.zip.end();
    await this.finished;
    return new Blob(this.chunks, { type: mime });
  }
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export const entryText = (entry: ZipEntry): string => strFromU8(entry.data);

/**
 * zip을 스트리밍으로 읽으며 항목이 완성될 때마다 handler를 기다린다.
 * 다음 청크를 읽기 전에 완성된 항목의 처리를 끝내므로 한 번에 몇 개 항목만 메모리에 머문다.
 */
export async function readZipEntries(
  source: Blob,
  handler: (entry: ZipEntry) => Promise<void>,
): Promise<void> {
  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  let pending: Promise<void>[] = [];
  let failure: unknown = null;

  unzipper.onfile = (file) => {
    if (file.name.endsWith('/')) return; // 디렉터리 항목
    const chunks: Uint8Array[] = [];
    file.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      chunks.push(data);
      if (final) pending.push(handler({ name: file.name, data: concat(chunks) }));
    };
    file.start();
  };

  const reader = source.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    unzipper.push(value, false);
    if (failure) throw failure;
    if (pending.length > 0) {
      const batch = pending;
      pending = [];
      await Promise.all(batch);
    }
  }
  unzipper.push(new Uint8Array(0), true);
  if (failure) throw failure;
  if (pending.length > 0) await Promise.all(pending);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Blob 생성용: fflate가 돌려준 뷰를 ArrayBuffer 기반으로 맞춘다 (복사 없이 캐스트) */
export function asBlobPart(bytes: Uint8Array): ArrayBufferBytes {
  return bytes as ArrayBufferBytes;
}
