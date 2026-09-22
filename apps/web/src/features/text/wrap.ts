/**
 * 화면(HTML)과 PDF 내보내기가 같은 결과를 내도록 줄바꿈을 직접 계산한다.
 * - 한글·한자·가나는 글자 단위로, 그 외(라틴 등)는 공백 단위로 나눈다
 * - 한 토큰이 폭보다 넓으면 글자 단위로 강제 분리
 * - 명시적 줄바꿈(\n)은 그대로 유지
 */

const CJK =
  /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

export type Measure = (text: string) => number;

/** 문단을 줄바꿈 가능한 토큰으로 나눈다. 단어 뒤의 공백은 단어에 붙는다 */
export function tokenize(paragraph: string): string[] {
  const tokens: string[] = [];
  let word = '';
  for (const ch of paragraph) {
    if (/\s/u.test(ch)) {
      word += ch;
      tokens.push(word);
      word = '';
      continue;
    }
    if (CJK.test(ch)) {
      if (word) {
        tokens.push(word);
        word = '';
      }
      tokens.push(ch);
      continue;
    }
    word += ch;
  }
  if (word) tokens.push(word);
  return tokens;
}

export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const token of tokenize(paragraph)) {
      if (line === '' && token.trim() === '') continue; // 줄머리 공백은 버린다
      const candidate = line + token;
      if (measure(candidate.trimEnd()) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') {
        lines.push(line.trimEnd());
        line = '';
      }
      const rest = token.trimStart();
      if (rest === '') continue;
      line =
        measure(rest.trimEnd()) <= maxWidth ? rest : breakByChars(rest, maxWidth, measure, lines);
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function breakByChars(token: string, maxWidth: number, measure: Measure, lines: string[]): string {
  let line = '';
  for (const ch of token) {
    const next = line + ch;
    if (line !== '' && measure(next.trimEnd()) > maxWidth) {
      lines.push(line.trimEnd());
      line = ch;
    } else {
      line = next;
    }
  }
  return line;
}
