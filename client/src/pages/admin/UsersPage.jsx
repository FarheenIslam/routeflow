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
import { createStaffFormSchema } from '../../schemas/admin.schemas.js';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { formatDateTime } from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const ROLE_FILTERS = ['ADMIN', 'COUNTER', 'DRIVER', 'PASSENGER'];
const ASSIGNABLE_ROLES = ['ADMIN', 'COUNTER', 'PASSENGER'];

const emptyValues = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'COUNTER',
  counterId: '',
};

function StaffFormModal({ open, counters, onClose, onSaved }) {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createStaffFormSchema(t), [t]);
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
    reset(emptyValues);
  }, [open, reset]);

  const role = useWatch({ control, name: 'role' });

  async function onSubmit(values) {
    setFormError(null);
    try {
      await adminApi.users.create({
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
        role: values.role,
        counterId: values.role === 'COUNTER' ? values.counterId : null,
      });
      toast.success(t('messages.created'));
      onSaved();
    } catch (error) {
      applyServerErrors(error, setError);
      setFormError(errorMessage(error, t('messages.failed')));
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.addTitle')}
      description={t('users.formHint')}
      onClose={onClose}
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="staffName" label={t('fields.name')} error={errors.name?.message} {...register('name')} />
          <FormField
            id="staffEmail"
            type="email"
            label={t('fields.email')}
            error={errors.email?.message}
            {...register('email')}
          />
          <FormField
            id="staffPhone"
            label={t('fields.phone')}
            placeholder="01712345678"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <FormField
            id="staffPassword"
            type="text"
            label={t('fields.password')}
            hint={t('hints.password')}
            error={errors.password?.message}
            {...register('password')}
          />
          <SelectField id="staffRole" label={t('fields.role')} error={errors.role?.message} {...register('role')}>
            {ASSIGNABLE_ROLES.map((value) => (
              <option key={value} value={value}>
                {t(`roles.${value}`)}
              </option>
            ))}
          </SelectField>
          {role === 'COUNTER' && (
            <SelectField
              id="staffCounter"
              label={t('fields.counter')}
              error={errors.counterId?.message}
              {...register('counterId')}
            >
              <option value="">{t('filters.select')}</option>
              {counters.map((counter) => (
                <option key={counter._id} value={counter._id}>
                  {counter.name} · {counter.code}
                </option>
              ))}
            </SelectField>
          )}
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

function RoleModal({ user, counters, onClose, onSaved }) {
  const { t } = useTranslation('admin');
  const [role, setRole] = useState(user?.role === 'DRIVER' ? 'COUNTER' : (user?.role ?? 'COUNTER'));
  const [counterId, setCounterId] = useState(user?.counterId?._id ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await adminApi.users.setRole(user._id, role, role === 'COUNTER' ? counterId || null : null);
      toast.success(t('messages.roleUpdated'));
      onSaved();
    } catch (problem) {
      setError(errorMessage(problem, t('messages.failed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(user)} title={t('users.roleTitle')} description={t('users.roleBody')} onClose={onClose}>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-4">
        <SelectField id="roleChange" label={t('fields.role')} value={role} onChange={(event) => setRole(event.target.value)}>
          {ASSIGNABLE_ROLES.map((value) => (
            <option key={value} value={value}>
              {t(`roles.${value}`)}
            </option>
          ))}
        </SelectField>

        {role === 'COUNTER' && (
          <SelectField
            id="roleCounter"
            label={t('fields.counter')}
            value={counterId}
            onChange={(event) => setCounterId(event.target.value)}
          >
            <option value="">{t('filters.none')}</option>
            {counters.map((counter) => (
              <option key={counter._id} value={counter._id}>
                {counter.name} · {counter.code}
              </option>
            ))}
          </SelectField>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? t('actions.working') : t('actions.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const { t, i18n } = useTranslation('admin');
  const currentUserId = useAuthStore((state) => state.user?.id);
  const list = useList(adminApi.users.list);
  const [counters, setCounters] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [roleUser, setRoleUser] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    adminApi
      .lookups()
      .then((response) => {
        if (alive) setCounters(response.data.counters);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function confirmStatusChange() {
    const nextStatus = statusTarget.status === 'active' ? 'suspended' : 'active';
    setBusy(true);
    try {
      await adminApi.users.setStatus(statusTarget._id, nextStatus);
      toast.success(t('messages.statusUpdated'));
      setStatusTarget(null);
      list.reload();
    } catch (error) {
      toast.error(errorMessage(error, t('messages.failed')));
    } finally {
      setBusy(false);
    }
  }

  const language = i18n.language;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        action={<Button onClick={() => setFormOpen(true)}>{t('users.add')}</Button>}
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          label={t('actions.search')}
          placeholder={t('users.searchPlaceholder')}
        />
        <SelectField
          id="user-role-filter"
          label={t('fields.role')}
          className="w-44"
          value={list.filters.role ?? ''}
          onChange={(event) => list.setFilter('role', event.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          {ROLE_FILTERS.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="user-status-filter"
          label={t('fields.status')}
          className="w-40"
          value={list.filters.status ?? ''}
          onChange={(event) => list.setFilter('status', event.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="suspended">{t('status.suspended')}</option>
          <option value="pending">{t('status.pending')}</option>
        </SelectField>
      </Card>

      <DataTable
        rows={list.items}
        loading={list.loading}
        error={list.error}
        emptyMessage={t('users.empty')}
        columns={[
          {
            key: 'name',
            header: t('fields.name'),
            render: (user) => (
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-xs text-ink-muted">{user.email}</p>
              </div>
            ),
          },
          {
            key: 'phone',
            header: t('fields.phone'),
            render: (user) => user.phone,
          },
          {
            key: 'role',
            header: t('fields.role'),
            render: (user) => (
              <div className="flex flex-col gap-1">
                <Badge tone="brand">{t(`roles.${user.role}`)}</Badge>
                {user.counterId?.name && (
                  <span className="text-xs text-ink-muted">{user.counterId.name}</span>
                )}
              </div>
            ),
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (user) => (
              <StatusBadge status={user.status} label={t(`status.${user.status}`)} />
            ),
          },
          {
            key: 'lastLoginAt',
            header: t('fields.lastLogin'),
            render: (user) => formatDateTime(user.lastLoginAt, language),
          },
          {
            key: 'actions',
            header: t('fields.actions'),
            headClassName: 'text-right',
            className: 'text-right whitespace-nowrap',
            render: (user) => {
              // The API refuses to demote or suspend the signed-in admin, so the
              // buttons are disabled here instead of failing after a click.
              const isSelf = user._id === currentUserId;
              return (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSelf}
                    title={isSelf ? t('users.selfHint') : undefined}
                    onClick={() => setRoleUser(user)}
                  >
                    {t('actions.changeRole')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSelf}
                    title={isSelf ? t('users.selfHint') : undefined}
                    className={user.status === 'active' ? 'text-red-600' : ''}
                    onClick={() => setStatusTarget(user)}
                  >
                    {user.status === 'active' ? t('actions.suspend') : t('actions.activate')}
                  </Button>
                </div>
              );
            },
          },
        ]}
      />

      <Pagination pagination={list.pagination} onPageChange={list.setPage} />

      <StaffFormModal
        open={formOpen}
        counters={counters}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          list.reload();
        }}
      />

      <RoleModal
        key={roleUser?._id ?? 'no-user'}
        user={roleUser}
        counters={counters}
        onClose={() => setRoleUser(null)}
        onSaved={() => {
          setRoleUser(null);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.status === 'active' ? t('users.suspendTitle') : t('users.activateTitle')
        }
        message={t('users.statusBody', { name: statusTarget?.name ?? '' })}
        confirmLabel={
          statusTarget?.status === 'active' ? t('actions.suspend') : t('actions.activate')
        }
        tone={statusTarget?.status === 'active' ? 'danger' : 'primary'}
        busy={busy}
        onCancel={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
      />
    </div>
  );
}
