import { create } from 'zustand';

export interface Selection {
  pageIndex: number;
  id: string;
}

interface SelectionState {
  /** 선택된 텍스트·노트 객체 (문서 전체에서 하나) */
  selected: Selection | null;
  /** 편집 중인 객체 id */
  editingId: string | null;
  select(selection: Selection | null): void;
  setEditing(id: string | null): void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selected: null,
  editingId: null,
  select: (selected) => set({ selected, editingId: null }),
  setEditing: (editingId) => set({ editingId }),
}));
