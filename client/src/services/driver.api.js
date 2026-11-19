import { api } from './api.js';

/**
 * Driver console endpoints. The server scopes every call to the signed-in
 * driver's own profile, so no driver id is ever sent from the browser.
 */
export const driverApi = {
  getTrips: (date) => api.get('/driver/trips', { params: date ? { date } : {} }),
  getTrip: (id) => api.get(`/driver/trips/${id}`),
  getHistory: () => api.get('/driver/history'),
  setStatus: (id, status, note = '') =>
    api.post(`/driver/trips/${id}/status`, { status, note }),
  reportLocation: (id, body) => api.post(`/driver/trips/${id}/location`, body),
};
