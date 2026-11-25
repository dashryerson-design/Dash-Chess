import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'reward';
  title: string;
  body?: string;
  icon?: string;
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismiss: (id: number) => void;
}

let n = 0;
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t, ms = 4500) => {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = (t: Omit<Toast, 'id'>, ms?: number) => useToasts.getState().push(t, ms);
export const toastError = (e: unknown) => toast({ kind: 'error', title: 'Something went wrong', body: e instanceof Error ? e.message : String(e) });
