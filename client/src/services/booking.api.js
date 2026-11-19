import { api } from './api.js';

/**
 * Public passenger endpoints. They need no token: the seat hold is tied to the
 * guest session cookie that the browser sends automatically.
 */
export const bookingApi = {
  getSettings: () => api.get('/public/settings'),
  getPopularRoutes: () => api.get('/public/popular-routes'),
  searchTrips: (params) => api.get('/trips/search', { params }),
  getTrip: (tripId) => api.get(`/trips/${tripId}`),
  getSeatMap: (tripId) => api.get(`/trips/${tripId}/seats`),
  createHold: ({ tripId, seatNumbers }) => api.post('/holds', { tripId, seatNumbers }),
  releaseTripHolds: (tripId) => api.delete('/holds', { params: { tripId } }),

  /** Turns this browser's seat holds into a real ticket. */
  createBooking: (payload) => api.post('/bookings', payload),
  /** `phone` opens a ticket from another device; the guest cookie is automatic. */
  getBooking: (code, phone) => api.get(`/bookings/${code}`, { params: phone ? { phone } : {} }),
  lookupBooking: ({ code, phone }) => api.get('/bookings/lookup', { params: { code, phone } }),
  getMyBookings: () => api.get('/bookings'),

  /** Returns a hosted SSLCommerz checkout URL. */
  initiatePayment: (bookingCode) => api.post('/payments/initiate', { bookingCode }),

  /** What cancelling now would refund, and whether this viewer may cancel. */
  getCancellationPreview: (code, phone) =>
    api.get(`/bookings/${code}/cancellation-preview`, { params: phone ? { phone } : {} }),
  cancelBooking: (code, reason, phone) =>
    api.post(`/bookings/${code}/cancel`, { reason }, { params: phone ? { phone } : {} }),
};
