/**
 * Card — the one surface primitive used across all four dashboards.
 * Keeping it here means radius, border and shadow never drift between pages.
 */
export default function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface shadow-soft ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
