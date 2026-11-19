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
import { createRouteFormSchema, parseStops, stopsToText } from '../../schemas/admin.schemas.js';
import { toast } from '../../store/toastStore.js';
import { formatDuration, formatNumber } from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const emptyValues = {
  code: '',
  name: '',
  originName: '',
  originCity: '',
  destinationName: '',
  destinationCity: '',
  totalDistanceKm: 0,
  estimatedDurationMinutes: 0,
  stopsText: '',
  status: 'active',
};

function RouteFormModal({ open, route, onClose, onSaved }) {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createRouteFormSchema(t), [t]);
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
      route
        ? {
            code: route.code,
            name: route.name,
            originName: route.origin?.name ?? '',
            originCity: route.origin?.city ?? '',
            destinationName: route.destination?.name ?? '',
            destinationCity: route.destination?.city ?? '',
            totalDistanceKm: route.totalDistanceKm ?? 0,
            estimatedDurationMinutes: route.estimatedDurationMinutes ?? 0,
            stopsText: stopsToText(route.stops),
            status: route.status,
          }
        : emptyValues,
    );
  }, [open, route, reset]);

  async function onSubmit(values) {
    setFormError(null);
    const payload = {
      code: values.code.toUpperCase(),
      name: values.name,
      origin: { name: values.originName, city: values.originCity || values.originName },
      destination: {
        name: values.destinationName,
        city: values.destinationCity || values.destinationName,
      },
      stops: parseStops(values.stopsText),
      totalDistanceKm: values.totalDistanceKm,
      estimatedDurationMinutes: values.estimatedDurationMinutes,
      status: values.status,
    };

    try {
      if (route) {
        await adminApi.routes.update(route._id, payload);
        toast.success(t('messages.updated'));
      } else {
        await adminApi.routes.create(payload);
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
      title={route ? t('routes.editTitle') : t('routes.addTitle')}
      description={t('routes.formHint')}
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
          <FormField
            id="code"
            label={t('fields.code')}
            placeholder="R-DHK-CTG"
            error={errors.code?.message}
            {...register('code')}
          />
          <FormField
            id="routeName"
            label={t('fields.routeName')}
            placeholder="Dhaka → Chattogram"
            error={errors.name?.message}
            {...register('name')}
          />
          <FormField
            id="originName"
            label={t('fields.origin')}
            error={errors.originName?.message}
            {...register('originName')}
          />
          <FormField
            id="originCity"
            label={t('fields.city')}
            hint={t('hints.optional')}
            error={errors.originCity?.message}
            {...register('originCity')}
          />
          <FormField
            id="destinationName"
            label={t('fields.destination')}
            error={errors.destinationName?.message}
            {...register('destinationName')}
          />
          <FormField
            id="destinationCity"
            label={t('fields.city')}
            hint={t('hints.optional')}
            error={errors.destinationCity?.message}
            {...register('destinationCity')}
          />
          <FormField
            id="totalDistanceKm"
            type="number"
            min="0"
            label={t('fields.distance')}
            error={errors.totalDistanceKm?.message}
            {...register('totalDistanceKm')}
          />
          <FormField
            id="estimatedDurationMinutes"
            type="number"
            min="0"
            label={t('fields.duration')}
            error={errors.estimatedDurationMinutes?.message}
            {...register('estimatedDurationMinutes')}
          />
          <SelectField
            id="routeStatus"
            label={t('fields.status')}
            error={errors.status?.message}
            {...register('status')}
          >
            <option value="active">{t('status.active')}</option>
            <option value="inactive">{t('status.inactive')}</option>
          </SelectField>
        </div>

        <div>
          <label htmlFor="stopsText" className="block text-sm font-medium">
            {t('fields.stops')}
          </label>
          <textarea
            id="stopsText"
            rows={4}
            placeholder={'Cumilla, 120, 100\nFeni, 190, 165'}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            {...register('stopsText')}
          />
          <p className="mt-1.5 text-xs text-ink-muted">{t('hints.stops')}</p>
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

export default function RoutesPage() {
  const { t, i18n } = useTranslation('admin');
  const language = i18n.language;
  const list = useList(adminApi.routes.list);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await adminApi.routes.remove(deleting._id);
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
        title={t('routes.title')}
        subtitle={t('routes.subtitle')}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t('routes.add')}
          </Button>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          label={t('actions.search')}
          placeholder={t('routes.searchPlaceholder')}
        />
        <SelectField
          id="route-status-filter"
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
        emptyMessage={t('routes.empty')}
        columns={[
          {
            key: 'name',
            header: t('fields.routeName'),
            render: (route) => (
              <div>
                <p className="font-medium">{route.name}</p>
                <p className="font-mono text-xs text-ink-muted">{route.code}</p>
              </div>
            ),
          },
          {
            key: 'path',
            header: t('routes.path'),
            render: (route) => (
              <span className="text-sm">
                {route.origin?.name} → {route.destination?.name}
              </span>
            ),
          },
          {
            key: 'stops',
            header: t('fields.stops'),
            render: (route) => <Badge>{formatNumber(route.stops?.length ?? 0, language)}</Badge>,
          },
          {
            key: 'estimatedDurationMinutes',
            header: t('routes.durationShort'),
            render: (route) => formatDuration(route.estimatedDurationMinutes, language),
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (route) => <StatusBadge status={route.status} label={t(`status.${route.status}`)} />,
          },
          {
            key: 'actions',
            header: t('fields.actions'),
            headClassName: 'text-right',
            className: 'text-right whitespace-nowrap',
            render: (route) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(route);
                    setFormOpen(true);
                  }}
                >
                  {t('actions.edit')}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleting(route)}>
                  {t('actions.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Pagination pagination={list.pagination} onPageChange={list.setPage} />

      <RouteFormModal
        open={formOpen}
        route={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('routes.deleteTitle')}
        message={t('routes.deleteBody')}
        confirmLabel={t('actions.delete')}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
