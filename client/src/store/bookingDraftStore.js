import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The only piece of booking state worth surviving a refresh: which seats this
 * browser is holding and when the hold dies.
 *
 * It is sessionStorage, not localStorage, because a hold belongs to one browsing
 * session. The server is still the source of truth — after a reload the seat map
 * reports the same seats as "mine" from the `bb_sid` cookie.
 */
export const useBookingDraftStore = create(
  persist(
    (set) => ({
      holds: {},

      setHold: (tripId, hold) =>
        set((state) => ({
          holds: {
            ...state.holds,
            [tripId]: {
              seatNumbers: hold.seats.map((seat) => seat.seatNumber),
              holdIds: hold.seats.map((seat) => seat.holdId),
              expiresAt: hold.expiresAt,
            },
          },
        })),

      clearHold: (tripId) =>
        set((state) => {
          const next = { ...state.holds };
          delete next[tripId];
          return { holds: next };
        }),
    }),
    {
      name: 'busbook.booking-draft',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ holds: state.holds }),
    },
  ),
);
