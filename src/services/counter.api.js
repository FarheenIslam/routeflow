import { api } from './api.js';

/**
 * Counter staff endpoints. Every call needs a COUNTER or ADMIN session; the
 * server enforces that, so the UI never decides who may sell a ticket.
 */
export const counterApi = {
  getContext: () => api.get('/counter/context'),
  searchBookings: (q) => api.get('/counter/bookings', { params: { q } }),
  sell: ({ tripId, seatNumbers, passenger }) =>
    api.post('/counter/bookings', { tripId, seatNumbers, passenger }),
  collectCash: (code) => api.post(`/counter/bookings/${code}/collect`),
  cancelBooking: (code, reason) => api.post(`/bookings/${code}/cancel`, { reason }),
};
