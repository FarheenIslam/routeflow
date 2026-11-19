import Spinner from './Spinner.jsx';

export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-muted">
      <Spinner className="size-6 text-brand-600" label={label} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
