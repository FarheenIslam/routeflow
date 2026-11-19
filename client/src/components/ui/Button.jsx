const VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700 disabled:bg-brand-200',
  secondary:
    'border border-line bg-surface text-ink hover:border-brand-200 hover:bg-brand-50 disabled:text-ink-muted',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-ink-muted',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * Every clickable action goes through this component so height, padding and
 * disabled behaviour stay consistent (and 44px tall on touch screens).
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const safeVariant = VARIANTS[variant] ? variant : 'primary';
  const safeSize = SIZES[size] ? size : 'md';

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[safeVariant]} ${SIZES[safeSize]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
