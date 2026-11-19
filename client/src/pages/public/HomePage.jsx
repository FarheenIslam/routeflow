import { useTranslation } from 'react-i18next';
import Badge from '../../components/ui/Badge.jsx';
import Card from '../../components/ui/Card.jsx';
import HealthCard from '../../components/health/HealthCard.jsx';
import HomeSearch from '../../components/booking/HomeSearch.jsx';

const ROLE_KEYS = ['admin', 'counter', 'driver', 'passenger'];

const ROLE_ICONS = {
  admin: (
    <path
      d="M12 3.5 5 6v5.5c0 4 2.9 7.3 7 8.5 4.1-1.2 7-4.5 7-8.5V6l-7-2.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  counter: (
    <>
      <path
        d="M4 9V7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V9"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 9h16v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M9 13.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  driver: (
    <>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 4v5.4M12 14.6V20M4 12h5.4M14.6 12H20" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  passenger: (
    <>
      <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
};

export default function HomePage() {
  const { t } = useTranslation();

  const foundationItems = [
    'api',
    'db',
    'ui',
    'auth',
    'admin',
    'booking',
    'tickets',
    'cancellations',
    'driver',
    'reports',
  ];
  const nextItems = ['deploy', 'credentials'];

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
          <div className="flex flex-col justify-center">
            <Badge tone="brand" dot className="w-fit">
              {t('home.phaseBadge')}
            </Badge>

            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {t('home.title')}
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              {t('home.subtitle')}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#search"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-600 px-6 text-base font-medium text-white transition-colors hover:bg-brand-700"
              >
                {t('home.primaryCta')}
              </a>
              <a
                href="#roles"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-line bg-surface px-6 text-base font-medium text-ink transition-colors hover:border-brand-200 hover:bg-brand-50"
              >
                {t('home.secondaryCta')}
              </a>
            </div>
          </div>

          <div className="lg:pl-2">
            <HealthCard />
          </div>
        </div>
      </section>

      {/* Search ----------------------------------------------------------- */}
      <section id="search" className="border-b border-line bg-canvas">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <HomeSearch />
        </div>
      </section>

      {/* Roles ------------------------------------------------------------ */}
      <section id="roles" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('home.rolesTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted sm:text-base">
            {t('home.rolesSubtitle')}
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_KEYS.map((role) => (
            <Card key={role} className="flex flex-col p-5">
              <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
                  {ROLE_ICONS[role]}
                </svg>
              </span>
              <h3 className="mt-4 text-base font-semibold">{t(`home.roles.${role}.name`)}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">
                {t(`home.roles.${role}.description`)}
              </p>
              <span className="mt-4 text-xs font-medium text-brand-700">
                {t(`home.roles.${role}.phase`)}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* Progress --------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight">{t('home.foundationTitle')}</h2>
            <ul className="mt-4 space-y-3">
              {foundationItems.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="size-3">
                      <path
                        d="m4.5 10.5 3.5 3.5 7.5-8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>{t(`home.foundation.${item}`)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight">{t('home.nextTitle')}</h2>
            <ul className="mt-4 space-y-3">
              {nextItems.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-200"
                  />
                  <span>{t(`home.next.${item}`)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>
    </>
  );
}
