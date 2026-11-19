import Badge from '../ui/Badge.jsx';

/**
 * Maps a stored status to a badge tone. The label always comes from i18n, so the
 * badge never shows a raw database value like "at_stop".
 */
const TONES = {
  active: 'success',
  scheduled: 'brand',
  started: 'brand',
  at_stop: 'brand',
  delayed: 'warning',
  maintenance: 'warning',
  on_leave: 'warning',
  pending: 'warning',
  completed: 'neutral',
  inactive: 'neutral',
  suspended: 'danger',
  cancelled: 'danger',
};

export default function StatusBadge({ status, label }) {
  return (
    <Badge tone={TONES[status] ?? 'neutral'} dot>
      {label}
    </Badge>
  );
}
