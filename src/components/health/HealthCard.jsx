import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { healthApi } from '../../services/api.js';
import { formatDateTime, formatUptime } from '../../utils/format.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Spinner from '../ui/Spinner.jsx';

const DATABASE_TONE = {
  connected: 'success',
  connecting: 'warning',
  not_configured: 'warning',
  disconnected: 'danger',
};

const DATABASE_LABEL = {
  connected: 'connected',
  connecting: 'checking',
  not_configured: 'notConfigured',
  disconnected: 'disconnected',
};

/**
 * Calls GET /api/health and shows three real states:
 * loading → skeleton, failure → error with retry, success → the facts.
 *
 * The endpoint answers 503 when the API is up but the database is not, so the
 * card reads the error body instead of treating it as a crash. That difference
 * ("API alive, database missing") is exactly what a beginner needs to see.
 */
export default function HealthCard() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ phase: 'loading', payload: null, error: null });
  const [checkedAt, setCheckedAt] = useState(null);

  /** Fetch only. Loading state is owned by the caller (effect or retry button),
   *  so the effect never calls setState synchronously on mount. */
  const fetchHealth = useCallback(async () => {
    try {
      const body = await healthApi.get();
      setState({ phase: 'ready', payload: body, error: null });
    } catch (error) {
      if (error.data) {
        // API responded (503) with a useful body — show it, do not hide it.
        setState({
          phase: 'ready',
          payload: { success: false, message: error.message, data: error.data },
          error: null,
        });
      } else {
        setState({ phase: 'error', payload: null, error });
      }
    } finally {
      setCheckedAt(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const handleRetry = () => {
    setState({ phase: 'loading', payload: null, error: null });
    fetchHealth();
  };

  const info = state.payload?.data;
  const database = info?.database;
  const apiOnline = Boolean(info);
  const databaseReady = database?.status === 'connected';

  return (
    <section
      id="status"
      aria-labelledby="status-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="status-heading" className="text-base font-semibold tracking-tight">
            {t('health.title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t('health.subtitle')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRetry}
          disabled={state.phase === 'loading'}
          className="shrink-0"
        >
          {state.phase === 'loading' ? <Spinner className="size-3.5" /> : null}
          {t('health.retry')}
        </Button>
      </div>

      {state.phase === 'loading' && (
        <div className="mt-5 space-y-3" aria-busy="true">
          <div className="h-4 w-2/3 animate-pulse rounded bg-canvas" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-canvas" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-canvas" />
        </div>
      )}

      {state.phase === 'error' && (
        <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{t('health.errorTitle')}</p>
          <p className="mt-1 text-sm text-red-700/90">{state.error?.message}</p>
          <p className="mt-2 text-xs text-red-700/80">
            Start the backend with <code className="font-mono">npm run dev</code> in the{' '}
            <code className="font-mono">server</code> folder.
          </p>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t('health.api')}
              </dt>
              <dd className="mt-1">
                <Badge tone={apiOnline ? 'success' : 'danger'} dot>
                  {apiOnline ? t('health.online') : t('health.offline')}
                </Badge>
              </dd>
            </div>

            <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t('health.database')}
              </dt>
              <dd className="mt-1">
                <Badge
                  tone={DATABASE_TONE[database?.status] ?? 'neutral'}
                  dot
                >
                  {t(`health.${DATABASE_LABEL[database?.status] ?? 'disconnected'}`)}
                </Badge>
              </dd>
            </div>

            <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t('health.environment')}
              </dt>
              <dd className="mt-1 text-sm font-medium capitalize">
                {info?.environment ?? '—'}
              </dd>
            </div>

            <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t('health.uptime')}
              </dt>
              <dd className="mt-1 text-sm font-medium" dir="ltr">
                {typeof info?.uptimeSeconds === 'number'
                  ? formatUptime(info.uptimeSeconds)
                  : '—'}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-ink-muted">
            {t('health.serverTime')}: {formatDateTime(info?.serverTime, i18n.language)}{' '}
            {checkedAt && (
              <span className="opacity-70">
                · {t('health.lastChecked', { time: formatDateTime(checkedAt, i18n.language) })}
              </span>
            )}
          </p>

          {!databaseReady && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">{t('health.setupTitle')}</p>
              <p className="mt-1 text-sm text-amber-900/90">{t('health.setupSteps')}</p>
              <ol className="mt-3 space-y-1 text-xs text-amber-900/90">
                <li>
                  1. <code className="font-mono">cp .env.example .env</code> (inside{' '}
                  <code className="font-mono">server/</code>)
                </li>
                <li>
                  2. Atlas → Connect → copy the <code className="font-mono">mongodb+srv://</code>{' '}
                  string into <code className="font-mono">MONGODB_URI</code>
                </li>
                <li>
                  3. <code className="font-mono">npm run seed</code>
                </li>
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
