import { useTranslation } from 'react-i18next';
import Badge from '../../components/ui/Badge.jsx';
import Card from '../../components/ui/Card.jsx';

/**
 * Phase 3 proves the role guard works, but the dashboards themselves are built
 * in Phases 4–7. Rather than mock up fake numbers, each role lands on a short,
 * honest page that says what is coming.
 */
export default function RolePlaceholderPage({ role }) {
  const { t } = useTranslation();
  const items = t(`rolesHome.${role}.items`, { returnObjects: true });
  const list = Array.isArray(items) ? items : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Badge tone="brand">{t(`rolesHome.${role}.phase`)}</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {t(`rolesHome.${role}.title`)}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{t(`rolesHome.${role}.subtitle`)}</p>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">{t('rolesHome.plannedTitle')}</h2>
        <ul className="mt-3 space-y-2.5">
          {list.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-200" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
        {t('rolesHome.note')}
      </p>
    </div>
  );
}
