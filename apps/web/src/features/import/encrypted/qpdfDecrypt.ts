import { PdfPasswordError } from './errors';

/**
 * qpdf(WebAssembly)로 PDF 암호를 푼다. 워커와 테스트(Node)가 같은 코드를 쓴다.
 * qpdf는 사용자 암호·소유자 암호 어느 쪽이든 받고, 소유자 암호만 걸린(권한 제한) 문서는 빈 암호로 푼다.
 */

/** Emscripten 모듈 중 우리가 쓰는 부분 */
export interface QpdfModule {
  callMain(args: string[]): number;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
}

export type QpdfFactory = (options: { locateFile: () => string }) => Promise<QpdfModule>;

export interface QpdfRunner {
  /** qpdf CLI를 한 번 실행한다. 종료 코드와 그동안 찍힌 메시지(stdout·stderr)를 돌려준다 */
  run(args: string[]): { code: number; messages: string[] };
  fs: QpdfModule['FS'];
}

/**
 * 모듈을 만들면서 console 출력을 가로챈다. 이 빌드는 print/printErr 옵션을 무시하고
 * 모듈을 만드는 시점의 console.log/error를 bind해 두므로, 그때 잠깐 바꿔치기해야 메시지를 받을 수 있다.
 */
export async function createQpdfRunner(
  factory: QpdfFactory,
  locateFile: () => string,
): Promise<QpdfRunner> {
  const messages: string[] = [];
  const capture = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  };
  const original = { log: console.log, error: console.error };
  console.log = capture;
  console.error = capture;
  let module: QpdfModule;
  try {
    module = await factory({ locateFile });
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  return {
    fs: module.FS,
    run(args) {
      messages.length = 0;
      const code = module.callMain(args);
      return { code, messages: [...messages] };
    },
  };
}

const INPUT = '/in.pdf';
const OUTPUT = '/out.pdf';
/** qpdf 종료 코드: 0 성공, 2 실패, 3 경고는 있지만 출력은 만들어짐 */
const EXIT_WARNINGS = 3;

/**
 * 암호를 풀어 새 PDF 바이트를 돌려준다. 암호가 없는 PDF도 그대로 통과한다.
 * 암호가 틀리면 PdfPasswordError, 그 밖의 실패는 qpdf 메시지를 담은 Error를 던진다.
 */
export function decryptWithQpdf(qpdf: QpdfRunner, bytes: Uint8Array, password: string): Uint8Array {
  qpdf.fs.writeFile(INPUT, bytes);
  try {
    // --deterministic-id: 같은 파일을 다시 가져와도 같은 바이트가 나와 중복 감지가 된다
    const args = ['--decrypt', '--deterministic-id'];
    if (password.length > 0) args.push(`--password=${password}`);
    args.push(INPUT, OUTPUT);
    const { code, messages } = qpdf.run(args);
    if (code !== 0 && code !== EXIT_WARNINGS) {
      if (messages.some((m) => /invalid password/i.test(m))) throw new PdfPasswordError();
      throw new Error(describeFailure(messages) ?? `qpdf 종료 코드 ${code}`);
    }
    try {
      return qpdf.fs.readFile(OUTPUT);
    } catch {
      throw new Error(describeFailure(messages) ?? '암호를 푼 파일을 만들지 못했습니다');
    }
  } finally {
    for (const path of [INPUT, OUTPUT]) {
      try {
        qpdf.fs.unlink(path);
      } catch {
        // 없는 파일은 무시
      }
    }
  }
}

/** "프로그램: /in.pdf: 메시지" 꼴에서 사람이 읽을 부분만 남긴다. 경고보다 오류를 우선한다 */
function describeFailure(messages: string[]): string | null {
  const errors = messages.filter((m) => !/^WARNING:/i.test(m));
  const line = errors.at(-1) ?? messages.at(-1);
  if (!line) return null;
  return line.replace(/^.*?\/in\.pdf: /, '').trim() || null;
}
