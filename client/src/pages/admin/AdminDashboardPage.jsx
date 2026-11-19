import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Card from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import StatusBadge from '../../components/admin/StatusBadge.jsx';
import { adminApi } from '../../services/admin.api.js';
import { formatDateTime, formatNumber } from '../../utils/datetime.js';

const STATUS_COLORS = ['#14867b', '#35a89b', '#0c6d66', '#eab308', '#dc2626', '#5b6b75'];

function StatCard({ label, value, hint, tone = 'brand' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      <span className={`mt-3 block h-1 w-10 rounded-full ${tone === 'brand' ? 'bg-brand-400' : 'bg-line'}`} />
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { t, i18n } = useTranslation('admin');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    adminApi
      .dashboard()
      .then((response) => {
        if (alive) setData(response.data);
      })
      .catch((problem) => {
        if (alive) setError(problem.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const language = i18n.language;
  const money = (count) => formatNumber(count, language);

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      {loading && (
        <Card className="flex items-center gap-3 p-6 text-sm text-ink-muted">
          <Spinner />
          {t('dashboard.loading')}
        </Card>
      )}

      {!loading && error && <Alert tone="error" title={t('dashboard.loadError')}>{error}</Alert>}

      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('dashboard.activeBuses')}
              value={money(data.counts.activeBuses)}
              hint={t('dashboard.ofTotal', { total: money(data.counts.totalBuses) })}
            />
            <StatCard
              label={t('dashboard.activeDrivers')}
              value={money(data.counts.activeDrivers)}
              hint={t('dashboard.ofTotal', { total: money(data.counts.totalDrivers) })}
            />
            <StatCard
              label={t('dashboard.upcomingTrips')}
              value={money(data.counts.upcomingTrips)}
              hint={t('dashboard.todayTripsCount', { value: money(data.counts.todayTrips) })}
            />
            <StatCard
              label={t('dashboard.passengers')}
              value={money(data.counts.totalPassengers)}
              hint={t('dashboard.activeStaffCount', { value: money(data.counts.activeStaff) })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('dashboard.totalRoutes')} value={money(data.counts.totalRoutes)} tone="plain" />
            <StatCard label={t('dashboard.totalCounters')} value={money(data.counts.totalCounters)} tone="plain" />
            <StatCard label={t('dashboard.totalTrips')} value={money(data.counts.totalTrips)} tone="plain" />
            <StatCard label={t('dashboard.todayTrips')} value={money(data.counts.todayTrips)} tone="plain" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="text-sm font-semibold">{t('dashboard.tripsByStatus')}</h2>
              {data.tripsByStatus.length === 0 ? (
                <p className="mt-6 text-sm text-ink-muted">{t('dashboard.chartEmpty')}</p>
              ) : (
                <div className="mt-3 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.tripsByStatus}
                        dataKey="count"
                        nameKey="status"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {data.tripsByStatus.map((entry, index) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => [
                          money(value),
                          t(`status.${item.payload.status}`),
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                {data.tripsByStatus.map((entry, index) => (
                  <li key={entry.status} className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }}
                      aria-hidden="true"
                    />
                    {t(`status.${entry.status}`)} · {money(entry.count)}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold">{t('dashboard.upcomingWeek')}</h2>
              {data.upcomingWeek.length === 0 ? (
                <p className="mt-6 text-sm text-ink-muted">{t('dashboard.chartEmpty')}</p>
              ) : (
                <div className="mt-3 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.upcomingWeek}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e8ea" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) =>
                          new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'Asia/Dhaka',
                          }).format(new Date(`${value}T00:00:00+06:00`))
                        }
                        tick={{ fontSize: 11, fill: '#5b6b75' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickFormatter={(value) => money(value)}
                        tick={{ fontSize: 11, fill: '#5b6b75' }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip
                        formatter={(value) => [money(value), t('dashboard.tripsCount')]}
                        labelFormatter={(value) => value}
                      />
                      <Bar dataKey="count" fill="#14867b" radius={[6, 6, 0, 0]} maxBarSize={38} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t('dashboard.nextTrips')}</h2>
              <DataTable
                rows={data.nextTrips}
                emptyMessage={t('dashboard.noTrips')}
                skeletonRows={0}
                columns={[
                  {
                    key: 'tripCode',
                    header: t('fields.tripCode'),
                    render: (trip) => <span className="font-mono text-xs">{trip.tripCode}</span>,
                  },
                  {
                    key: 'route',
                    header: t('fields.route'),
                    render: (trip) =>
                      trip.routeId
                        ? `${trip.routeId.origin?.name} → ${trip.routeId.destination?.name}`
                        : '—',
                  },
                  {
                    key: 'departure',
                    header: t('fields.departureDate'),
                    render: (trip) => formatDateTime(trip.departureAt, language),
                  },
                  {
                    key: 'status',
                    header: t('fields.status'),
                    render: (trip) => (
                      <StatusBadge status={trip.status} label={t(`status.${trip.status}`)} />
                    ),
                  },
                ]}
              />
            </div>

            <div className="space-y-3">
              <Card className="p-4">
                <h2 className="text-sm font-semibold">{t('dashboard.fleetByType')}</h2>
                {data.fleetByType.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-muted">{t('dashboard.chartEmpty')}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.fleetByType.map((row) => (
                      <li key={row.busType} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-ink-muted">{t(`busType.${row.busType}`)}</span>
                        <Badge>{money(row.count)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="text-sm font-semibold">{t('dashboard.revenueTitle')}</h2>
                <p className="mt-2 text-sm text-ink-muted">{t('dashboard.revenueNote')}</p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
