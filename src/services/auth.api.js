import { api } from './api.js';

/**
 * All auth calls in one place. The axios instance already sends cookies
 * (withCredentials) and normalises errors to { message, status, errors }.
 */
export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  changePassword: (payload) => api.patch('/auth/change-password', payload),
};
