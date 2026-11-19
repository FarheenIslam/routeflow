import { useTranslation } from 'react-i18next';

import Modal from './Modal.jsx';
import Button from '../ui/Button.jsx';

/** Small confirmation dialog for destructive or irreversible-looking actions. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  tone = 'danger',
}) {
  const { t } = useTranslation('admin');

  return (
    <Modal open={open} title={title} onClose={onCancel} size="sm">
      <p className="text-sm text-ink-muted">{message}</p>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t('actions.cancel')}
        </Button>
        <Button variant={tone} onClick={onConfirm} disabled={busy}>
          {busy ? t('actions.working') : (confirmLabel ?? t('actions.confirm'))}
        </Button>
      </div>
    </Modal>
  );
}
