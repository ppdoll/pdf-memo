import { create } from 'zustand';

export interface PasswordRequestView {
  id: number;
  fileName: string;
  /** 1부터. 2 이상이면 직전 암호가 틀린 것 */
  attempt: number;
}

interface Pending {
  view: PasswordRequestView;
  resolve: (value: string | null) => void;
}

interface PromptState {
  /** 지금 대화상자에 떠 있는 요청 */
  current: PasswordRequestView | null;
}

/** 가져오기 큐가 암호를 물을 때 쓰는 대화상자 상태. 요청은 순서대로 하나씩 보여 준다 */
export const usePdfPasswordPrompt = create<PromptState>()(() => ({ current: null }));

const queue: Pending[] = [];
let nextId = 1;

function showHead(): void {
  usePdfPasswordPrompt.setState({ current: queue[0]?.view ?? null });
}

/** 가져오기 파이프라인이 부른다. 대화상자가 답하면 암호(취소하면 null)로 풀린다 */
export function requestPdfPassword(request: {
  fileName: string;
  attempt: number;
}): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ view: { id: nextId++, ...request }, resolve });
    if (queue.length === 1) showHead();
  });
}

/** 대화상자가 부른다. null은 취소 */
export function answerPdfPassword(value: string | null): void {
  const head = queue.shift();
  showHead();
  head?.resolve(value);
}
