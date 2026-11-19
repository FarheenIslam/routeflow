import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n.js';

import SeatMap from './SeatMap.jsx';

const layout = {
  rows: 2,
  columns: 3,
  aisleAfterColumn: 2,
  seatPrefix: 'A',
  disabledSeats: [1],
};

const seats = [
  { number: 2, label: 'A1', row: 1, column: 2, status: 'available' },
  { number: 3, label: 'A2', row: 1, column: 3, status: 'held' },
  { number: 4, label: 'A3', row: 2, column: 1, status: 'booked' },
  { number: 5, label: 'A4', row: 2, column: 2, status: 'available' },
  { number: 6, label: 'A5', row: 2, column: 3, status: 'available' },
];

describe('SeatMap', () => {
  it('draws every real seat with its label', () => {
    render(<SeatMap layout={layout} seats={seats} />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /A1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A5/ })).toBeInTheDocument();
  });

  it('only makes free seats clickable', async () => {
    const onToggle = vi.fn();
    render(<SeatMap layout={layout} seats={seats} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button', { name: /A3/ })); // booked
    await userEvent.click(screen.getByRole('button', { name: /A2/ })); // held by someone
    expect(onToggle).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /A1/ }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('locks every seat while this session holds them', async () => {
    const onToggle = vi.fn();
    render(
      <SeatMap layout={layout} seats={seats} selected={[2]} locked onToggle={onToggle} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /A5/ }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
