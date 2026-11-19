import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import Modal from '../../components/admin/Modal.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import SearchInput from '../../components/admin/SearchInput.jsx';
import StatusBadge from '../../components/admin/StatusBadge.jsx';
import { useList } from '../../hooks/useList.js';
import { adminApi } from '../../services/admin.api.js';
import {
  createCancelTripSchema,
  createTripFormSchema,
  splitPoints,
} from '../../schemas/admin.schemas.js';
import { toast } from '../../store/toastStore.js';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  toDateInputValue,
} from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

/** Statuses the API accepts through the admin "change status" endpoint. */
const EDITABLE_STATUSES = ['scheduled', 'delayed', 'started', 'completed'];
const FILTER_STATUSES = [...EDITABLE_STATUSES, 'at_stop', 'cancelled'];

function TripFormModal({ open, trip, lookups, defaultDate, onClose, onSaved }) {
  const { t, i18n } = useTranslation('admin');
  const schema = useMemo(() => createTripFormSchema(t), [t]);
  const [formError, setFormError] = useState(null);

  const defaults = useMemo(
    () => ({
      routeId: '',
      busId: '',
      driverId: '',
      // The page supplies today's Dhaka date, computed in the click handler.
      departureDate: defaultDate ?? '',
      departureTime: '08:00',
      fare: 0,
      boardingPoints: '',
      droppingPoints: '',
      status: 'scheduled',
    }),
    [defaultDate],
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (!open) return;
    reset(
      trip
        ? {
            routeId: trip.routeId?._id ?? '',
            busId: trip.busId?._id ?? '',
            driverId: trip.driverId?._id ?? '',
            departureDate: toDateInputValue(trip.departureAt),
            departureTime: trip.departureTime,
            fare: trip.fare,
            boardingPoints: (trip.boardingPoints ?? []).join(', '),
            droppingPoints: (trip.droppingPoints ?? []).join(', '),
            status: EDITABLE_STATUSES.includes(trip.status) ? trip.status : 'scheduled',
          }
        : defaults,
    );
  }, [open, trip, reset, defaults]);

  async function onSubmit(values) {
    setFormError(null);
    const payload = {
      routeId: values.routeId,
      busId: values.busId,
      driverId: values.driverId,
      departureDate: values.departureDate,
      departureTime: values.departureTime,
      fare: values.fare,
      boardingPoints: splitPoints(values.boardingPoints),
      droppingPoints: splitPoints(values.droppingPoints),
      status: values.status,
    };

    try {
      if (trip) {
        await adminApi.trips.update(trip._id, payload);
        toast.success(t('messages.updated'));
      } else {
        await adminApi.trips.create(payload);
        toast.success(t('messages.created'));
      }
      onSaved();
    } catch (error) {
      applyServerErrors(error, setError);
      setFormError(errorMessage(error, t('messages.failed')));
    }
  }

  return (
    <Modal
      open={open}
      title={trip ? t('trips.editTitle') : t('trips.addTitle')}
      description={t('trips.formHint')}
      onClose={onClose}
      size="lg"
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="routeId"
            label={t('fields.route')}
            error={errors.routeId?.message}
            {...register('routeId')}
          >
            <option value="">{t('filters.select')}</option>
            {lookups.routes.map((route) => (
              <option key={route._id} value={route._id}>
                {route.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="busId"
            label={t('fields.bus')}
            error={errors.busId?.message}
            {...register('busId')}
          >
            <option value="">{t('filters.select')}</option>
            {lookups.buses.map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber}
                {' · '}
                {t('buses.seatCount', { seats: formatNumber(bus.totalSeats, i18n.language) })}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="driverId"
            label={t('fields.driver')}
            error={errors.driverId?.message}
            {...register('driverId')}
          >
            <option value="">{t('filters.select')}</option>
            {lookups.drivers.map((driver) => (
              <option key={driver._id} value={driver._id}>
                {driver.name} · {driver.phone}
              </option>
            ))}
          </SelectField>

          <FormField
            id="departureDate"
            type="date"
            label={t('fields.departureDate')}
            error={errors.departureDate?.message}
            {...register('departureDate')}
          />
          <FormField
            id="departureTime"
            type="time"
            label={t('fields.departureTime')}
            error={errors.departureTime?.message}
            {...register('departureTime')}
          />
          <FormField
            id="fare"
            type="number"
            min="0"
            label={t('fields.fare')}
            error={errors.fare?.message}
            {...register('fare')}
          />
          <FormField
            id="boardingPoints"
            label={t('fields.boardingPoints')}
            hint={t('hints.boardingPoints')}
            error={errors.boardingPoints?.message}
            {...register('boardingPoints')}
          />
          <FormField
            id="droppingPoints"
            label={t('fields.droppingPoints')}
            hint={t('hints.boardingPoints')}
            error={errors.droppingPoints?.message}
            {...register('droppingPoints')}
          />
          <SelectField id="tripStatus" label={t('fields.status')} error={errors.status?.message} {...register('status')}>
            {EDITABLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('actions.working') : t('actions.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CancelTripModal({ trip, onClose, onSaved }) {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createCancelTripSchema(t), [t]);
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { reason: '' } });

  useEffect(() => {
    if (trip) reset({ reason: '' });
  }, [trip, reset]);

  async function onSubmit(values) {
    setFormError(null);
    try {
      await adminApi.trips.cancel(trip._id, values.reason);
      toast.success(t('messages.cancelled'));
      onSaved();
    } catch (error) {
      applyServerErrors(error, setError);
      setFormError(errorMessage(error, t('messages.failed')));
    }
  }

  return (
    <Modal
      open={Boolean(trip)}
      title={t('trips.cancelTitle')}
      description={t('trips.cancelBody')}
      onClose={onClose}
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="cancelReason" className="block text-sm font-medium">
            {t('trips.cancelReasonLabel')}
          </label>
          <textarea
            id="cancelReason"
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            {...register('reason')}
          />
          {errors.reason?.message && (
            <p className="mt-1.5 text-xs font-medium text-red-600">{errors.reason.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('actions.close')}
          </Button>
          <Button variant="danger" type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('actions.working') : t('trips.cancelConfirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function TripsPage() {
  const { t, i18n } = useTranslation('admin');
  const list = useList(adminApi.trips.list);
  const [lookups, setLookups] = useState({ routes: [], buses: [], drivers: [] });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultDate, setDefaultDate] = useState('');
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => {
    let alive = true;
    adminApi
      .lookups()
      .then((response) => {
        if (alive) setLookups(response.data);
      })
      .catch(() => {
        // Selects stay empty; the list and existing trips still work.
      });
    return () => {
      alive = false;
    };
  }, []);

  async function changeStatus(trip, status) {
    try {
      await adminApi.trips.setStatus(trip._id, status);
      toast.success(t('messages.statusUpdated'));
      list.reload();
    } catch (error) {
      toast.error(errorMessage(error, t('messages.failed')));
    }
  }

  const language = i18n.language;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('trips.title')}
        subtitle={t('trips.subtitle')}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setDefaultDate(toDateInputValue(new Date()));
              setFormOpen(true);
            }}
          >
            {t('trips.add')}
          </Button>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          label={t('actions.search')}
          placeholder={t('trips.searchPlaceholder')}
        />
        <SelectField
          id="trip-status-filter"
          label={t('fields.status')}
          className="w-44"
          value={list.filters.status ?? ''}
          onChange={(event) => list.setFilter('status', event.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          {FILTER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </SelectField>
      </Card>

      <DataTable
        rows={list.items}
        loading={list.loading}
        error={list.error}
        emptyMessage={t('trips.empty')}
        columns={[
          {
            key: 'tripCode',
            header: t('fields.tripCode'),
            render: (trip) => <span className="font-mono text-xs">{trip.tripCode}</span>,
          },
          {
            key: 'routeId',
            header: t('fields.route'),
            render: (trip) => (
              <div>
                <p className="font-medium">{trip.routeId?.name ?? '—'}</p>
                <p className="text-xs text-ink-muted">{trip.busId?.busNumber ?? ''}</p>
              </div>
            ),
          },
          {
            key: 'departureAt',
            header: t('fields.departureDate'),
            render: (trip) => formatDateTime(trip.departureAt, language),
          },
          {
            key: 'driverId',
            header: t('fields.driver'),
            render: (trip) => trip.driverId?.name ?? '—',
          },
          {
            key: 'fare',
            header: t('fields.fare'),
            render: (trip) => formatMoney(trip.fare, language),
          },
          {
            key: 'seats',
            header: t('fields.seats'),
            render: (trip) => (
              <Badge>
                {formatNumber(trip.seatSummary?.booked ?? 0, language)} /{' '}
                {formatNumber(trip.seatSummary?.total ?? 0, language)}
              </Badge>
            ),
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (trip) => (
              <div className="space-y-1">
                <StatusBadge status={trip.status} label={t(`status.${trip.status}`)} />
                {EDITABLE_STATUSES.includes(trip.status) && (
                  <select
                    aria-label={t('actions.changeStatus')}
                    value={trip.status}
                    onChange={(event) => changeStatus(trip, event.target.value)}
                    className="block w-full rounded-md border border-line bg-surface px-1.5 py-1 text-xs"
                  >
                    {EDITABLE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            header: t('fields.actions'),
            headClassName: 'text-right',
            className: 'text-right whitespace-nowrap',
            render: (trip) => (
              <div className="flex justify-end gap-1">
                {EDITABLE_STATUSES.includes(trip.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(trip);
                      setFormOpen(true);
                    }}
                  >
                    {t('actions.edit')}
                  </Button>
                )}
                {!['cancelled', 'completed'].includes(trip.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => setCancelling(trip)}
                  >
                    {t('trips.cancelAction')}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Pagination pagination={list.pagination} onPageChange={list.setPage} />

      <TripFormModal
        open={formOpen}
        trip={editing}
        lookups={lookups}
        defaultDate={defaultDate}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          list.reload();
        }}
      />

      <CancelTripModal
        trip={cancelling}
        onClose={() => setCancelling(null)}
        onSaved={() => {
          setCancelling(null);
          list.reload();
        }}
      />
    </div>
  );
}
