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
import ConfirmDialog from '../../components/admin/ConfirmDialog.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import Modal from '../../components/admin/Modal.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import SearchInput from '../../components/admin/SearchInput.jsx';
import StatusBadge from '../../components/admin/StatusBadge.jsx';
import { useList } from '../../hooks/useList.js';
import { adminApi } from '../../services/admin.api.js';
import { createCounterFormSchema } from '../../schemas/admin.schemas.js';
import { toast } from '../../store/toastStore.js';
import { formatNumber } from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const emptyValues = {
  code: '',
  name: '',
  branchName: '',
  street: '',
  city: '',
  division: '',
  phone: '',
  email: '',
  commissionPercent: 0,
  status: 'active',
};

function CounterFormModal({ open, counter, onClose, onSaved }) {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createCounterFormSchema(t), [t]);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: emptyValues });

  useEffect(() => {
    if (!open) return;
    reset(
      counter
        ? {
            code: counter.code,
            name: counter.name,
            branchName: counter.branchName ?? '',
            street: counter.address?.street ?? '',
            city: counter.address?.city ?? '',
            division: counter.address?.division ?? '',
            phone: counter.phone ?? '',
            email: counter.email ?? '',
            commissionPercent: counter.commissionPercent ?? 0,
            status: counter.status,
          }
        : emptyValues,
    );
  }, [open, counter, reset]);

  async function onSubmit(values) {
    setFormError(null);
    const payload = {
      code: values.code.toUpperCase(),
      name: values.name,
      branchName: values.branchName,
      address: { street: values.street, city: values.city, division: values.division },
      phone: values.phone || null,
      email: values.email || null,
      commissionPercent: values.commissionPercent,
      status: values.status,
    };

    try {
      if (counter) {
        await adminApi.counters.update(counter._id, payload);
        toast.success(t('messages.updated'));
      } else {
        await adminApi.counters.create(payload);
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
      title={counter ? t('counters.editTitle') : t('counters.addTitle')}
      description={t('counters.formHint')}
      onClose={onClose}
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="code" label={t('fields.code')} placeholder="CT-01" error={errors.code?.message} {...register('code')} />
          <FormField id="counterName" label={t('fields.name')} error={errors.name?.message} {...register('name')} />
          <FormField
            id="branchName"
            label={t('fields.branchName')}
            hint={t('hints.optional')}
            error={errors.branchName?.message}
            {...register('branchName')}
          />
          <FormField id="street" label={t('fields.street')} hint={t('hints.optional')} error={errors.street?.message} {...register('street')} />
          <FormField id="city" label={t('fields.city')} hint={t('hints.optional')} error={errors.city?.message} {...register('city')} />
          <FormField
            id="division"
            label={t('fields.division')}
            hint={t('hints.optional')}
            error={errors.division?.message}
            {...register('division')}
          />
          <FormField
            id="counterPhone"
            label={t('fields.phone')}
            placeholder="01712345678"
            hint={t('hints.optional')}
            error={errors.phone?.message}
            {...register('phone')}
          />
          <FormField
            id="counterEmail"
            type="email"
            label={t('fields.email')}
            hint={t('hints.optional')}
            error={errors.email?.message}
            {...register('email')}
          />
          <FormField
            id="commissionPercent"
            type="number"
            min="0"
            max="100"
            label={t('fields.commission')}
            error={errors.commissionPercent?.message}
            {...register('commissionPercent')}
          />
          <SelectField id="counterStatus" label={t('fields.status')} error={errors.status?.message} {...register('status')}>
            <option value="active">{t('status.active')}</option>
            <option value="inactive">{t('status.inactive')}</option>
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

export default function CountersPage() {
  const { t, i18n } = useTranslation('admin');
  const language = i18n.language;
  const list = useList(adminApi.counters.list, { limit: 20 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await adminApi.counters.remove(deleting._id);
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
        title={t('counters.title')}
        subtitle={t('counters.subtitle')}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t('counters.add')}
          </Button>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          label={t('actions.search')}
          placeholder={t('counters.searchPlaceholder')}
        />
        <SelectField
          id="counter-status-filter"
          label={t('fields.status')}
          className="w-40"
          value={list.filters.status ?? ''}
          onChange={(event) => list.setFilter('status', event.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="inactive">{t('status.inactive')}</option>
        </SelectField>
      </Card>

      <DataTable
        rows={list.items}
        loading={list.loading}
        error={list.error}
        emptyMessage={t('counters.empty')}
        columns={[
          {
            key: 'name',
            header: t('fields.name'),
            render: (counter) => (
              <div>
                <p className="font-medium">{counter.name}</p>
                <p className="font-mono text-xs text-ink-muted">{counter.code}</p>
              </div>
            ),
          },
          {
            key: 'branchName',
            header: t('fields.branchName'),
            render: (counter) => (
              <div>
                <p>{counter.branchName || '—'}</p>
                <p className="text-xs text-ink-muted">{counter.address?.city ?? ''}</p>
              </div>
            ),
          },
          {
            key: 'phone',
            header: t('fields.phone'),
            render: (counter) => counter.phone ?? '—',
          },
          {
            key: 'staff',
            header: t('fields.staff'),
            render: (counter) => <Badge>{formatNumber(counter.staffUserIds?.length ?? 0, language)}</Badge>,
          },
          {
            key: 'commissionPercent',
            header: t('fields.commission'),
            render: (counter) =>
              `${formatNumber(counter.commissionPercent ?? 0, language)}%`,
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (counter) => (
              <StatusBadge status={counter.status} label={t(`status.${counter.status}`)} />
            ),
          },
          {
            key: 'actions',
            header: t('fields.actions'),
            headClassName: 'text-right',
            className: 'text-right whitespace-nowrap',
            render: (counter) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(counter);
                    setFormOpen(true);
                  }}
                >
                  {t('actions.edit')}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleting(counter)}>
                  {t('actions.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Pagination pagination={list.pagination} onPageChange={list.setPage} />

      <CounterFormModal
        open={formOpen}
        counter={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('counters.deleteTitle')}
        message={t('counters.deleteBody')}
        confirmLabel={t('actions.delete')}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
