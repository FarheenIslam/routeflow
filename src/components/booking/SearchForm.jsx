import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Button from '../ui/Button.jsx';
import FormField from '../ui/FormField.jsx';
import SelectField from '../ui/SelectField.jsx';
import { toDateInputValue } from '../../utils/datetime.js';

const BUS_TYPES = ['AC', 'NON_AC', 'AC_SLEEPER', 'DOUBLE_DECKER', 'HIACE'];

/**
 * The passenger's entry point: two cities and a date.
 *
 * The form only builds a URL. The server does the searching, so a shared link
 * (`/trips?origin=Dhaka&destination=Chattogram&date=…`) always shows the same
 * real timetable instead of trusting whatever was in the browser.
 */
export default function SearchForm({ initial = {}, compact = false }) {
  const { t } = useTranslation('booking');
  const navigate = useNavigate();

  const [origin, setOrigin] = useState(initial.origin ?? '');
  const [destination, setDestination] = useState(initial.destination ?? '');
  const [date, setDate] = useState(initial.date ?? toDateInputValue(new Date()));
  const [busType, setBusType] = useState(initial.busType ?? '');
  const [errors, setErrors] = useState({});

  const submit = (event) => {
    event.preventDefault();

    const from = origin.trim();
    const to = destination.trim();
    const nextErrors = {};

    if (!from || !to) nextErrors.form = t('search.required');
    else if (from.toLowerCase() === to.toLowerCase()) nextErrors.form = t('search.sameCity');

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const params = new URLSearchParams({ origin: from, destination: to });
    if (date) params.set('date', date);
    if (busType) params.set('busType', busType);

    navigate(`/trips?${params.toString()}`);
  };

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <div className={compact ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.9fr_0.8fr_auto]'}>
        <FormField
          id="search-origin"
          label={t('search.from')}
          placeholder={t('search.fromPlaceholder')}
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          autoComplete="off"
          list="search-origin-list"
        />
        <datalist id="search-origin-list">
          <option value="Dhaka" />
          <option value="Chattogram" />
          <option value="Sylhet" />
          <option value="Rajshahi" />
          <option value="Khulna" />
        </datalist>

        <FormField
          id="search-destination"
          label={t('search.to')}
          placeholder={t('search.toPlaceholder')}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          autoComplete="off"
          list="search-destination-list"
        />
        <datalist id="search-destination-list">
          <option value="Chattogram" />
          <option value="Dhaka" />
          <option value="Sylhet" />
          <option value="Rajshahi" />
          <option value="Khulna" />
        </datalist>

        <FormField
          id="search-date"
          type="date"
          label={t('search.date')}
          value={date}
          min={toDateInputValue(new Date())}
          onChange={(event) => setDate(event.target.value)}
        />

        <SelectField
          id="search-bus-type"
          label={t('search.busType')}
          value={busType}
          onChange={(event) => setBusType(event.target.value)}
        >
          <option value="">{t('search.allTypes')}</option>
          {BUS_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </SelectField>

        <div className={compact ? 'sm:col-span-2' : 'lg:pt-[26px]'}>
          <Button type="submit" size="lg" className="w-full lg:w-auto">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            {t('search.submit')}
          </Button>
        </div>
      </div>

      {errors.form && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {errors.form}
        </p>
      )}
    </form>
  );
}
