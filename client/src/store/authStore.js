import { create } from 'zustand';
import { authApi } from '../services/auth.api.js';

/**
 * Session state.
 *
 * The JWT itself is never stored here — it lives in an httpOnly cookie the
 * browser sends automatically. This store only keeps the *user profile* that the
 * server returned, plus whether we are signed in.
 *
 * status:
 *   'unknown'       → we have not asked the API yet (show a loader)
 *   'authenticated' → /api/auth/me succeeded
 *   'anonymous'     → no valid session
 */
export const useAuthStore = create((set) => ({
  user: null,
  status: 'unknown',

  /** Called once on app start. A 401 here simply means "not signed in". */
  fetchMe: async () => {
    try {
      const response = await authApi.me();
      set({ user: response.data.user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'anonymous' });
    }
  },

  login: async (credentials) => {
    const response = await authApi.login(credentials);
    set({ user: response.data.user, status: 'authenticated' });
    return response.data.user;
  },

  register: async (details) => {
    const response = await authApi.register(details);
    set({ user: response.data.user, status: 'authenticated' });
    return response.data.user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the network call fails, drop the local profile.
      set({ user: null, status: 'anonymous' });
    }
  },

  setUser: (user) => set({ user }),

  reset: () => set({ user: null, status: 'anonymous' }),
}));

/** Role → landing page, so every sign-in lands somewhere useful. */
export function roleHomePath(role) {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'COUNTER':
      return '/counter';
    case 'DRIVER':
      return '/driver';
    default:
      return '/account';
  }
}
