import { create } from 'zustand';

/**
 * Minimal toast system (no dependency). Used for sign-in success, sign-out and
 * server errors. Messages auto-dismiss after 5 seconds but can be closed early.
 */
export const useToastStore = create((set, get) => ({
  toasts: [],

  push: ({ title, description = null, tone = 'success' }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, title, description, tone }] }));
    setTimeout(() => get().dismiss(id), 5000);
    return id;
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const toast = {
  success: (title, description) => useToastStore.getState().push({ title, description, tone: 'success' }),
  error: (title, description) => useToastStore.getState().push({ title, description, tone: 'danger' }),
  info: (title, description) => useToastStore.getState().push({ title, description, tone: 'brand' }),
};
