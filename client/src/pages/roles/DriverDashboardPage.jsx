import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import FullPageLoader from '../../components/ui/FullPageLoader.jsx';
import DriverTripMap from '../../components/driver/DriverTripMap.jsx';
import { driverApi } from '../../services/driver.api.js';
import { toast } from '../../store/toastStore.js';
import { formatDate, formatTime } from '../../utils/datetime.js';
import { errorMessage } from '../../utils/formErrors.js';

const STATUS_TONES = {
  scheduled: 'brand',
  delayed: 'warning',
  started: 'success',
  at_stop: 'warning',
  completed: 'neutral',
  cancelled: 'danger',
};

/**
 * Driver console (mobile-first).
 *
 * The driver sees only their own trips. Status buttons follow the server's
 * transition table — the UI cannot invent a move, and the API rejects one that
 * does not fit. Location reporting is explicitly manual: the driver enters it,
 * nothing implies GPS.
 */
export default function DriverDashboardPage() {
  const { t, i18n } = useTranslation(['booking', 'common']);
  const language = i18n.language;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [driver, setDriver] = useState(null);
  const [trips, setTrips] = useState([]);
  const [date, setDate] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [history, setHistory] = useState([]);
  const [location, setLocation] = useState({
    lat: '',
    lng: '',
    currentStopIndex: '0',
    atStop: false,
    note: '',
  });
  const [locationError, setLocationError] = useState(null);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const response = await driverApi.getTrips();
      setDriver(response.data.driver);
      setTrips(response.data.trips);
      setDate(response.data.date);
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
      setDriver(null);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await driverApi.getHistory();
      setHistory(response.data.trips);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadDetail = useCallback(async (tripId) => {
    setDetailError(null);
    try {
      const response = await driverApi.getTrip(tripId);
      setDetail(response.data.trip);
    } catch (error) {
      setDetail(null);
      setDetailError(error);
    }
  }, []);

  useEffect(() => {
    loadTrips();
    loadHistory();
  }, [loadTrips, loadHistory]);

  // A running trip refreshes its last reported position every 30 seconds. This
  // is not a GPS feed: it only re-reads what the driver typed in.
  useEffect(() => {
    if (!selectedId || !['started', 'at_stop'].includes(detail?.status)) return undefined;
    const timer = setInterval(() => loadDetail(selectedId), 30_000);
    return () => clearInterval(timer);
  }, [selectedId, detail?.status, loadDetail]);

  function selectTrip(tripId) {
    setSelectedId(tripId);
    setDetail(null);
    setLocationError(null);
    loadDetail(tripId);
  }

  async function changeStatus(status) {
    if (!detail) return;
    setBusy(true);
    try {
      await driverApi.setStatus(detail.id, status);
      await Promise.all([loadDetail(detail.id), loadTrips()]);
      if (status === 'completed') loadHistory();
      toast.success(t('driver.statusUpdated'));
    } catch (error) {
      toast.error(errorMessage(error, t('common:errors.generic')));
    } finally {
      setBusy(false);
    }
  }

  async function submitLocation(event) {
    event.preventDefault();
    if (!detail) return;

    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setLocationError(t('driver.location.invalidCoordinates'));
      return;
    }

    setBusy(true);
    setLocationError(null);
    try {
      const response = await driverApi.reportLocation(detail.id, {
        lat,
        lng,
        note: location.note || undefined,
        currentStopIndex: Number(location.currentStopIndex),
        atStop: location.atStop,
      });
      setDetail((current) => ({ ...current, lastLocation: response.data.location }));
      setLocation((current) => ({ ...current, note: '' }));
      toast.success(t('driver.location.saved'));
    } catch (error) {
      setLocationError(errorMessage(error, t('driver.location.failed')));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <FullPageLoader label={t('driver.loading')} />;

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title={t('driver.loadFailed')}>
          {loadError.message}
        </Alert>
        <Button size="sm" variant="secondary" onClick={loadTrips}>
          {t('common:common.retry')}
        </Button>
      </div>
    );
  }

  const canReportLocation =
    detail && ['started', 'at_stop'].includes(detail.status);
  const stops = detail?.route?.stops ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('driver.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {driver?.name} · {date ? formatDate(date, language) : ''}
          </p>
        </div>
        {driver?.assignedBus?.busNumber && (
          <Badge tone="brand">
            {t('driver.busBadge', {
              bus: driver.assignedBus.busNumber,
              type: t(`types.${driver.assignedBus.busType}`, {
                defaultValue: driver.assignedBus.busType,
              }),
            })}
          </Badge>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-base font-semibold">{t('driver.todayTitle')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('driver.todaySubtitle')}</p>

            {trips.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">{t('driver.noTrips')}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {trips.map((trip) => (
                  <li key={trip.id}>
                    <button
                      type="button"
                      onClick={() => selectTrip(trip.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedId === trip.id
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-line hover:border-brand-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {trip.route?.name ?? trip.tripCode}
                        </p>
                        <Badge tone={STATUS_TONES[trip.status] ?? 'neutral'}>
                          {t(`driver.status.${trip.status}`)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        {formatDate(trip.departureAt, language)} ·{' '}
                        {formatTime(trip.departureAt, language)} · {trip.bus?.busNumber}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {t('driver.passengerCount', { count: trip.passengerCount })} ·{' '}
                        {trip.tripCode}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold">{t('driver.historyTitle')}</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">{t('driver.noHistory')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {history.map((trip) => (
                  <li key={trip.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{trip.route?.name ?? trip.tripCode}</p>
                      <p className="text-xs text-ink-muted">
                        {formatDate(trip.departureAt, language)} ·{' '}
                        {trip.passengerCount} {t('driver.passengersShort')}
                      </p>
                    </div>
                    <Badge tone="neutral">{trip.tripCode}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {detailError && (
            <Alert tone="error" title={t('driver.loadFailed')}>
              {detailError.message}
            </Alert>
          )}

          {!detail && !detailError && (
            <Card className="p-6 text-sm text-ink-muted">{t('driver.chooseTrip')}</Card>
          )}

          {detail && (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">
                      {detail.route?.origin?.city} → {detail.route?.destination?.city}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {detail.route?.name} · {formatDate(detail.departureAt, language)} ·{' '}
                      {formatTime(detail.departureAt, language)}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {detail.bus?.busNumber} · {detail.bus?.operatorName} · {detail.tripCode}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[detail.status] ?? 'neutral'}>
                    {t(`driver.status.${detail.status}`)}
                  </Badge>
                </div>

                {detail.cancelReason && (
                  <Alert tone="error" className="mt-3">
                    {t('driver.cancelledReason', { reason: detail.cancelReason })}
                  </Alert>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-ink-muted">{t('driver.passengers')}</p>
                    <p className="text-lg font-semibold">{detail.passengerCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">{t('driver.seats')}</p>
                    <p className="text-lg font-semibold">
                      {detail.seatSummary.booked}/{detail.seatSummary.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">{t('driver.startedAt')}</p>
                    <p className="text-sm font-medium">
                      {detail.startedAt ? formatTime(detail.startedAt, language) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">{t('driver.completedAt')}</p>
                    <p className="text-sm font-medium">
                      {detail.completedAt ? formatTime(detail.completedAt, language) : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {['scheduled', 'delayed'].includes(detail.status) && (
                    <Button onClick={() => changeStatus('started')} disabled={busy}>
                      {t('driver.actions.start')}
                    </Button>
                  )}
                  {detail.status === 'started' && (
                    <Button
                      variant="secondary"
                      onClick={() => changeStatus('at_stop')}
                      disabled={busy}
                    >
                      {t('driver.actions.atStop')}
                    </Button>
                  )}
                  {detail.status === 'at_stop' && (
                    <Button onClick={() => changeStatus('started')} disabled={busy}>
                      {t('driver.actions.resume')}
                    </Button>
                  )}
                  {['started', 'at_stop'].includes(detail.status) && (
                    <Button
                      variant="danger"
                      onClick={() => changeStatus('completed')}
                      disabled={busy}
                    >
                      {t('driver.actions.complete')}
                    </Button>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{t('driver.map.title')}</h2>
                    <p className="mt-1 text-sm text-ink-muted">{t('driver.map.subtitle')}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => loadDetail(detail.id)}
                    disabled={busy}
                  >
                    {t('driver.map.refresh')}
                  </Button>
                </div>
                <div className="mt-3">
                  <DriverTripMap trip={detail} t={t} language={language} />
                </div>
                {['started', 'at_stop'].includes(detail.status) && (
                  <p className="mt-2 text-xs text-ink-muted">{t('driver.map.autoRefresh')}</p>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">{t('driver.location.title')}</h2>
                <p className="mt-1 text-sm text-ink-muted">{t('driver.location.subtitle')}</p>

                {!canReportLocation && (
                  <Alert tone="info" className="mt-3">
                    {t('driver.location.startFirst')}
                  </Alert>
                )}

                {detail.lastLocation && (
                  <div className="mt-3 rounded-lg border border-line bg-canvas p-3 text-sm">
                    <p className="font-medium">
                      {detail.lastLocation.currentStopName ?? '—'}
                      {detail.lastLocation.nextStopName
                        ? ` → ${detail.lastLocation.nextStopName}`
                        : ''}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {t('driver.location.lastReported', {
                        time: formatTime(detail.lastLocation.reportedAt, language),
                      })}{' '}
                      · {detail.lastLocation.lat}, {detail.lastLocation.lng}
                    </p>
                    {detail.lastLocation.note && (
                      <p className="mt-1 text-xs text-ink-muted">{detail.lastLocation.note}</p>
                    )}
                  </div>
                )}

                {locationError && (
                  <Alert tone="error" className="mt-3">
                    {locationError}
                  </Alert>
                )}

                <form onSubmit={submitLocation} className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                      id="driverLat"
                      type="number"
                      step="0.0001"
                      label={t('driver.location.lat')}
                      value={location.lat}
                      onChange={(event) =>
                        setLocation({ ...location, lat: event.target.value })
                      }
                      disabled={!canReportLocation}
                      required
                    />
                    <FormField
                      id="driverLng"
                      type="number"
                      step="0.0001"
                      label={t('driver.location.lng')}
                      value={location.lng}
                      onChange={(event) =>
                        setLocation({ ...location, lng: event.target.value })
                      }
                      disabled={!canReportLocation}
                      required
                    />
                    <SelectField
                      id="driverStop"
                      label={t('driver.location.stop')}
                      value={location.currentStopIndex}
                      onChange={(event) =>
                        setLocation({ ...location, currentStopIndex: event.target.value })
                      }
                      disabled={!canReportLocation}
                    >
                      {stops.length === 0 ? (
                        <option value="0">{detail.route?.origin?.name ?? '—'}</option>
                      ) : (
                        stops.map((stop, index) => (
                          <option key={`${stop.name}-${index}`} value={String(index)}>
                            {stop.name}
                          </option>
                        ))
                      )}
                    </SelectField>
                    <FormField
                      id="driverNote"
                      label={t('driver.location.note')}
                      value={location.note}
                      onChange={(event) =>
                        setLocation({ ...location, note: event.target.value })
                      }
                      disabled={!canReportLocation}
                      maxLength={200}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={location.atStop}
                      onChange={(event) =>
                        setLocation({ ...location, atStop: event.target.checked })
                      }
                      disabled={!canReportLocation}
                    />
                    {t('driver.location.atStop')}
                  </label>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!canReportLocation || busy}
                  >
                    {busy ? t('driver.location.saving') : t('driver.location.save')}
                  </Button>
                  <p className="text-xs text-ink-muted">{t('driver.location.manualNote')}</p>
                </form>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">{t('driver.manifestTitle')}</h2>
                {detail.passengers.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">{t('driver.emptyManifest')}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {detail.passengers.map((row) => (
                      <li key={row.bookingCode} className="flex items-start justify-between gap-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium">{row.name}</p>
                          <p className="text-xs text-ink-muted" dir="ltr">
                            {row.phone} · {row.bookingCode}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-brand-700">
                          {row.seats.join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
