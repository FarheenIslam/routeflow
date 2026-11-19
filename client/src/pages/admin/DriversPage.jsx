import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
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
import { createDriverFormSchema } from '../../schemas/admin.schemas.js';
import { toast } from '../../store/toastStore.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const DRIVER_STATUSES = ['active', 'on_leave', 'inactive'];

const emptyValues = {
  name: '',
  phone: '',
  email: '',
  licenseNumber: '',
  licenseExpiry: '',
  assignedBusId: '',
  address: '',
  status: 'active',
  createLogin: false,
  loginEmail: '',
  loginPassword: '',
};

function DriverFormModal({ open, driver, buses, onClose, onSaved }) {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createDriverFormSchema(t), [t]);
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
      driver
        ? {
            ...emptyValues,
            name: driver.name,
            phone: driver.phone,
            email: driver.email ?? '',
            licenseNumber: driver.licenseNumber,
            licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.slice(0, 10) : '',
            assignedBusId: driver.assignedBusId?._id ?? driver.assignedBusId ?? '',
            address: driver.address ?? '',
            status: driver.status,
          }
        : emptyValues,
    );
  }, [open, driver, reset]);

  const createLogin = useWatch({ control, name: 'createLogin' });

  async function onSubmit(values) {
    setFormError(null);
    const profile = {
      name: values.name,
      phone: values.phone,
      email: values.email || null,
      licenseNumber: values.licenseNumber.toUpperCase(),
      licenseExpiry: values.licenseExpiry || null,
      assignedBusId: values.assignedBusId || null,
      address: values.address,
      status: values.status,
    };

    try {
      if (driver) {
        await adminApi.drivers.update(driver._id, profile);
        toast.success(t('messages.updated'));
      } else {
        await adminApi.drivers.create({
          ...profile,
          createLogin: values.createLogin,
          loginEmail: values.createLogin ? values.loginEmail : null,
          loginPassword: values.createLogin ? values.loginPassword : null,
        });
        toast.success(
          values.createLogin ? t('messages.createdWithLogin') : t('messages.created'),
        );
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
      title={driver ? t('drivers.editTitle') : t('drivers.addTitle')}
      description={t('drivers.formHint')}
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
            id="name"
            label={t('fields.name')}
            error={errors.name?.message}
            {...register('name')}
          />
          <FormField
            id="phone"
            label={t('fields.phone')}
            placeholder="01712345678"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <FormField
            id="email"
            type="email"
            label={t('fields.email')}
            hint={t('hints.optional')}
            error={errors.email?.message}
            {...register('email')}
          />
          <FormField
            id="licenseNumber"
            label={t('fields.licenseNumber')}
            error={errors.licenseNumber?.message}
            {...register('licenseNumber')}
          />
          <FormField
            id="licenseExpiry"
            type="date"
            label={t('fields.licenseExpiry')}
            hint={t('hints.optional')}
            error={errors.licenseExpiry?.message}
            {...register('licenseExpiry')}
          />
          <SelectField
            id="assignedBusId"
            label={t('fields.assignedBus')}
            error={errors.assignedBusId?.message}
            {...register('assignedBusId')}
          >
            <option value="">{t('filters.none')}</option>
            {buses.map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber} · {bus.operatorName}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="driverStatus"
            label={t('fields.status')}
            error={errors.status?.message}
            {...register('status')}
          >
            {DRIVER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </SelectField>
          <FormField
            id="address"
            label={t('fields.address')}
            hint={t('hints.optional')}
            error={errors.address?.message}
            {...register('address')}
          />
        </div>

        {!driver && (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium">{t('drivers.loginLegend')}</legend>
            <p className="text-xs text-ink-muted">{t('drivers.loginHint')}</p>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 rounded border-line" {...register('createLogin')} />
              {t('drivers.createLogin')}
            </label>

            {createLogin && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <FormField
                  id="loginEmail"
                  type="email"
                  label={t('fields.email')}
                  error={errors.loginEmail?.message}
                  {...register('loginEmail')}
                />
                <FormField
                  id="loginPassword"
                  type="text"
                  label={t('fields.password')}
                  hint={t('hints.password')}
                  error={errors.loginPassword?.message}
                  {...register('loginPassword')}
                />
              </div>
            )}
          </fieldset>
        )}

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

export default function DriversPage() {
  const { t } = useTranslation('admin');
  const list = useList(adminApi.drivers.list);
  const [buses, setBuses] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    adminApi
      .lookups()
      .then((response) => {
        if (alive) setBuses(response.data.buses);
      })
      .catch(() => {
        // The bus select simply stays empty; the list itself still works.
      });
    return () => {
      alive = false;
    };
  }, []);

  async function confirmDelete() {
    setBusy(true);
    try {
      await adminApi.drivers.remove(deleting._id);
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
        title={t('drivers.title')}
        subtitle={t('drivers.subtitle')}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t('drivers.add')}
          </Button>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          label={t('actions.search')}
          placeholder={t('drivers.searchPlaceholder')}
        />
        <SelectField
          id="driver-status-filter"
          label={t('fields.status')}
          className="w-40"
          value={list.filters.status ?? ''}
          onChange={(event) => list.setFilter('status', event.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          {DRIVER_STATUSES.map((status) => (
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
        emptyMessage={t('drivers.empty')}
        columns={[
          {
            key: 'name',
            header: t('fields.name'),
            render: (driver) => (
              <div>
                <p className="font-medium">{driver.name}</p>
                <p className="text-xs text-ink-muted">{driver.phone}</p>
              </div>
            ),
          },
          {
            key: 'licenseNumber',
            header: t('fields.licenseNumber'),
            render: (driver) => <span className="font-mono text-xs">{driver.licenseNumber}</span>,
          },
          {
            key: 'assignedBusId',
            header: t('fields.assignedBus'),
            render: (driver) => driver.assignedBusId?.busNumber ?? '—',
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (driver) => (
              <StatusBadge status={driver.status} label={t(`status.${driver.status}`)} />
            ),
          },
          {
            key: 'actions',
            header: t('fields.actions'),
            headClassName: 'text-right',
            className: 'text-right whitespace-nowrap',
            render: (driver) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(driver);
                    setFormOpen(true);
                  }}
                >
                  {t('actions.edit')}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleting(driver)}>
                  {t('actions.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Pagination pagination={list.pagination} onPageChange={list.setPage} />

      <DriverFormModal
        open={formOpen}
        driver={editing}
        buses={buses}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('drivers.deleteTitle')}
        message={t('drivers.deleteBody', { name: deleting?.name ?? '' })}
        confirmLabel={t('actions.delete')}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
