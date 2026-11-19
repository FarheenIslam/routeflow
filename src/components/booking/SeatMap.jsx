import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

const STATUS_STYLES = {
  available: 'border-line bg-surface text-ink hover:border-brand-400 hover:bg-brand-50',
  mine: 'border-brand-600 bg-brand-600 text-white',
  held: 'border-amber-200 bg-amber-50 text-amber-800',
  booked: 'border-line bg-canvas text-ink-muted/50',
  blocked: 'border-dashed border-line bg-canvas text-ink-muted/40',
};

const LEGEND = [
  ['available', 'border-line bg-surface'],
  ['mine', 'border-brand-600 bg-brand-600'],
  ['held', 'border-amber-200 bg-amber-50'],
  ['booked', 'border-line bg-canvas'],
  ['blocked', 'border-dashed border-line bg-canvas'],
];

/**
 * The bus drawn as a grid.
 *
 * `seatNumber` is the grid position, so a disabled seat (a door, the stairs)
 * simply has no seat and leaves a dashed gap — the rows stay aligned.
 * Once the browser holds its seats, every seat becomes read-only: a half-released
 * hold is far more confusing than asking the passenger to release and pick again.
 */
export default function SeatMap({ layout, seats, selected = [], locked = false, onToggle }) {
  const { t } = useTranslation('booking');
  const seatByNumber = new Map(seats.map((seat) => [seat.number, seat]));
  const selectedSet = new Set(selected);

  const rows = Array.from({ length: layout.rows }, (_, index) => index + 1);
  const columns = Array.from({ length: layout.columns }, (_, index) => index + 1);

  return (
    <div>
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
              <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 3.5v4M10 12.5v4" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            {t('seat.driver')}
          </span>
          <span>{t('seat.front')}</span>
        </div>

        <div className="space-y-2" role="group" aria-label={t('seat.mapLabel')}>
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-3 text-right text-[11px] text-ink-muted" aria-hidden="true">
                {row}
              </span>

              <div className="flex flex-1 items-center gap-1.5 sm:gap-2">
                {columns.map((column) => {
                  const number = (row - 1) * layout.columns + column;
                  const seat = seatByNumber.get(number);
                  const aisle =
                    column === layout.aisleAfterColumn ? (
                      <span key={`aisle-${column}`} className="w-3 sm:w-5" aria-hidden="true" />
                    ) : null;

                  if (!seat) {
                    return (
                      <Fragment key={number}>
                        {aisle}
                        <span
                          aria-hidden="true"
                          className="h-10 flex-1 rounded-md border border-dashed border-line/70 bg-canvas/40"
                        />
                      </Fragment>
                    );
                  }

                  const isSelected = selectedSet.has(seat.number) || seat.status === 'mine';
                  const clickable = !locked && (seat.status === 'available' || seat.status === 'mine');
                  const style = STATUS_STYLES[seat.status] ?? STATUS_STYLES.available;

                  return (
                    <Fragment key={number}>
                      {aisle}
                      <button
                        type="button"
                        onClick={() => onToggle?.(seat.number)}
                        disabled={!clickable}
                        aria-pressed={isSelected}
                        aria-label={`${seat.label} — ${t(`seat.${seat.status}`)}`}
                        title={t(`seat.${seat.status}`)}
                        className={`h-10 flex-1 rounded-md border text-[11px] font-medium transition-colors ${style} ${
                          clickable ? 'cursor-pointer' : 'cursor-not-allowed'
                        } ${isSelected && seat.status !== 'mine' ? 'border-brand-600 bg-brand-600 text-white' : ''}`}
                      >
                        {seat.label}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        {LEGEND.map(([status, swatch]) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-3.5 rounded border ${swatch}`}
            />
            {t(`seat.${status}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
