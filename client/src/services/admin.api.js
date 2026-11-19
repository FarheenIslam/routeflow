import { api } from './api.js';

/**
 * Every admin endpoint goes through here, so pages never build URL strings.
 * Express mounts all of them behind `authenticate` + `authorize('ADMIN')`, so an
 * admin page simply cannot be used by another role even if a route leaks.
 */
const crud = (base) => ({
  list: (params) => api.get(base, { params }),
  get: (id) => api.get(`${base}/${id}`),
  create: (body) => api.post(base, body),
  update: (id, body) => api.patch(`${base}/${id}`, body),
  remove: (id) => api.delete(`${base}/${id}`),
});

export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  lookups: () => api.get('/admin/lookups'),

  buses: {
    ...crud('/admin/buses'),
    setStatus: (id, status) => api.patch(`/admin/buses/${id}/status`, { status }),
  },
  drivers: crud('/admin/drivers'),
  routes: crud('/admin/routes'),
  trips: {
    ...crud('/admin/trips'),
    setStatus: (id, status) => api.patch(`/admin/trips/${id}/status`, { status }),
    cancel: (id, reason) => api.post(`/admin/trips/${id}/cancel`, { reason }),
  },
  counters: crud('/admin/counters'),
  users: {
    list: (params) => api.get('/admin/users', { params }),
    create: (body) => api.post('/admin/users', body),
    setStatus: (id, status) => api.patch(`/admin/users/${id}/status`, { status }),
    setRole: (id, role, counterId = null) =>
      api.patch(`/admin/users/${id}/role`, { role, counterId }),
  },
  settings: {
    get: () => api.get('/admin/settings'),
    update: (body) => api.put('/admin/settings', body),
  },
  reports: {
    summary: (params) => api.get('/admin/reports/summary', { params }),
    bookingsCsv: (params) =>
      api.get('/admin/reports/bookings.csv', { params, responseType: 'blob' }),
  },
  cancellations: {
    list: (params) => api.get('/admin/cancellations', { params }),
    reviewRefund: (id, body) => api.patch(`/admin/cancellations/${id}/refund`, body),
  },
};
