import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n.js';

import SearchForm from './SearchForm.jsx';

function renderForm() {
  return render(
    <MemoryRouter>
      <SearchForm />
    </MemoryRouter>,
  );
}

describe('SearchForm', () => {
  it('refuses to search when both cities are the same', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('From'), 'Dhaka');
    await userEvent.type(screen.getByLabelText('To'), 'dhaka');
    await userEvent.click(screen.getByRole('button', { name: /search buses/i }));

    expect(
      screen.getByText('Departure and destination must be different'),
    ).toBeInTheDocument();
  });

  it('requires both cities', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /search buses/i }));

    expect(screen.getByText('Enter both cities')).toBeInTheDocument();
  });
});
