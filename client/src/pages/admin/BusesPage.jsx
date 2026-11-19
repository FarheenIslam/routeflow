import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import ConfirmDialog from '../../components/admin/ConfirmDialog.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import Modal from '../../components/admin/Modal.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import SearchInput from '../../components/admin/SearchInput.jsx';
import StatusBadge from '../../components/admin/StatusBadge.jsx';
import { useList } from '../../hooks/useList.js';
import { adminApi } from '../../services/admin.api.js';
import { createBusFormSchema } from '../../schemas/admin.schemas.js';
import { toast } from '../../store/toastStore.js';
import { formatNumber } from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const BUS_TYPES = ['AC', 'NON_AC', 'AC_SLEEPER', 'DOUBLE_DECKER', 'HIACE'];
const BUS_STATUSES = ['active', 'maintenance', 'inactive'];

const emptyValues = {
  busNumber: '',
  operatorName: '',
  busType: 'AC',
  status: 'active',
  rows: 10,
  columns: 4,
  aisleAfterColumn: 2,
  seatPrefix: 'A',
  disabledSeats: '',
};

function BusFormModal({ open, bus, onClose, onSaved }) {
  const { t, i18n } = useTranslation('admin');
  const schema = useMemo(() => createBusFormSchema(t), [t]);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: emptyValues });

  useEffect(() => {
    if (!open) return;
    reset(
      bus
        ? {
            busNumber: bus.busNumber,
            operatorName: bus.operatorName,
            busType: bus.busType,
            status: bus.status,
            rows: bus.seatLayout?.rows ?? 10,
            columns: bus.seatLayout?.columns ?? 4,
            aisleAfterColumn: bus.seatLayout?.aisleAfterColumn ?? 2,
            seatPrefix: bus.seatLayout?.seatPrefix ?? 'A',
            disabledSeats: (bus.seatLayout?.disabledSeats ?? []).join(', '),
          }
        : emptyValues,
    );
  }, [open, bus, reset]);

  const rows = Number(useWatch({ control, name: 'rows' })) || 0;
  const columns = Number(useWatch({ control, name: 'columns' })) || 0;
  const disabledCount = (useWatch({ control, name: 'disabledSeats' }) || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && Number(part) > 0).length;
  const seatPreview = Math.max(0, rows * columns - disabledCount);

  async function onSubmit(values) {
    setFormError(null);
    const payload = {
      busNumber: values.busNumber.toUpperCase(),
      operatorName: values.operatorName,
      busType: values.busType,
      status: values.status,
      seatLayout: {
        rows: values.rows,
        columns: values.columns,
        aisleAfterColumn: values.aisleAfterColumn,
        seatPrefix: values.seatPrefix || 'A',
        disabledSeats: (values.disabledSeats || '')
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((seat) => Number.isInteger(seat) && seat > 0),
      },
    };

    try {
      if (bus) {
        await adminApi.buses.update(bus._id, payload);
        toast.success(t('messages.updated'));
      } else {
        await adminApi.buses.create(payload);
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
      title={bus ? t('buses.editTitle') : t('buses.addTitle')}
      description={t('buses.formHint')}
      onClose={onClose}
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="busNumber"
            label={t('fields.busNumber')}
            placeholder="DHAKA-METRO-BA-11-2233"
            error={errors.busNumber?.message}
            {...register('busNumber')}
          />
          <FormField
            id="operatorName"
            label={t('fields.operatorName')}
            placeholder="Shohag Paribahan"
            error={errors.operatorName?.message}
            {...register('operatorName')}
          />
          <SelectField id="busType" label={t('fields.busType')} error={errors.busType?.message} {...register('busType')}>
            {BUS_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`busType.${type}`)}
              </option>
            ))}
          </SelectField>
          <SelectField id="status" label={t('fields.status')} error={errors.status?.message} {...register('status')}>
            {BUS_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <FormField
            id="rows"
            type="number"
            min="1"
            max="20"
            label={t('fields.rows')}
            error={errors.rows?.message}
            {...register('rows')}
          />
          <FormField
            id="columns"
            type="number"
            min="1"
            max="6"
            label={t('fields.columns')}
            error={errors.columns?.message}
            {...register('columns')}
          />
          <FormField
            id="aisleAfterColumn"
            type="number"
            min="1"
            max="5"
            label={t('fields.aisleAfterColumn')}
            error={errors.aisleAfterColumn?.message}
            {...register('aisleAfterColumn')}
          />
          <FormField
            id="seatPrefix"
            label={t('fields.seatPrefix')}
            hint={t('hints.seatPrefix')}
            error={errors.seatPrefix?.message}
            {...register('seatPrefix')}
          />
        </div>

        <FormField
          id="disabledSeats"
          label={t('fields.disabledSeats')}
          hint={t('hints.disabledSeats')}
          placeholder="1, 44"
          error={errors.disabledSeats?.message}
          {...register('disabledSeats')}
        />

        <p className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {t('buses.seatsPreview', { seats: formatNumber(seatPreview, i18n.language) })}
        </p>

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

export default function BusesPage() {
  const { t, i18n } = useTranslation('admin');
  const language = i18n.language;
  const list = useList(adminApi.buses.list);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function changeStatus(bus, status) {
    try {
      await adminApi.buses.setStatus(bus._id, status);
      toast.success(t('messages.statusUpdated'));
      list.reload();
    } catch (error) {
      toast.error(errorMessage(error, t('messages.failed')));
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await adminApi.buses.remove(deleting._id);
      toast.success(t('messages.deleted'));
      setDeleting(null);
      list.reload();
    } catch (error) {
      toast.error(errorMessage(error, t('messages.failed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('buses.title')}
        subtitle={t('buses.subtitle')}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t('buses.add')}
          </Button>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          label={t('actions.search')}
          placeholder={t('buses.searchPlaceholder')}
        />
        <SelectField
          id="bus-status-filter"
          label={t('fields.status')}
          className="w-40"
          value={list.filters.status ?? ''}
          onChange={(event) => list.setFilter('status', event.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          {BUS_STATUSES.map((status) => (
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
        emptyMessage={t('buses.empty')}
        columns={[
          {
            key: 'busNumber',
            header: t('fields.busNumber'),
            render: (bus) => (
              <div>
                <p className="font-medium">{bus.busNumber}</p>
                <p className="text-xs text-ink-muted">{bus.operatorName}</p>
              </div>
            ),
          },
          {
            key: 'busType',
            header: t('fields.busType'),
            render: (bus) => <Badge>{t(`busType.${bus.busType}`)}</Badge>,
          },
          {
            key: 'totalSeats',
            header: t('fields.totalSeats'),
            render: (bus) => formatNumber(bus.totalSeats, language),
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (bus) => <StatusBadge status={bus.status} label={t(`status.${bus.status}`)} />,
          },
          {
            key: 'actions',
            header: t('fields.actions'),
            headClassName: 'text-right',
            className: 'text-right whitespace-nowrap',
            render: (bus) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(bus);
                    setFormOpen(true);
                  }}
                >
                  {t('actions.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => changeStatus(bus, bus.status === 'active' ? 'inactive' : 'active')}
                >
                  {bus.status === 'active' ? t('actions.deactivate') : t('actions.activate')}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleting(bus)}>
                  {t('actions.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Pagination pagination={list.pagination} onPageChange={list.setPage} />

      <BusFormModal
        open={formOpen}
        bus={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('buses.deleteTitle')}
        message={t('buses.deleteBody')}
        confirmLabel={t('actions.delete')}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
