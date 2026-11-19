import axios from 'axios';

/**
 * In development this is "/api" and Vite proxies it to Express on port 5000.
 * In production set VITE_API_BASE_URL to your deployed API origin + "/api".
 * Only public configuration ever belongs in a VITE_ variable.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Turns every failure into the same small object:
 *   { message, status, errors, data }
 * so components never have to know about axios internals.
 */
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const payload = error.response?.data;
    const status = error.response?.status ?? 0;

    let message = payload?.message;
    if (!message) {
      if (error.code === 'ECONNABORTED') message = 'The server took too long to respond.';
      else if (!error.response) message = 'Cannot reach the API. Is the backend running?';
      else message = 'Something went wrong. Please try again.';
    }

    return Promise.reject({
      message,
      status,
      errors: payload?.errors ?? null,
      data: payload?.data ?? null,
    });
  },
);

/** Endpoint wrappers live next to their feature; health is the Phase 2 one. */
export const healthApi = {
  get: () => api.get('/health'),
};
