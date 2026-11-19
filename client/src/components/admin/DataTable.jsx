import Alert from '../ui/Alert.jsx';

/**
 * Table shell used by every admin page.
 *
 * columns: [{ key, header, render(row), className, headClassName }]
 * Loading shows skeleton rows (no layout jump); an error shows the API message
 * instead of an empty table, so "nothing here" and "request failed" never look
 * the same.
 */
export default function DataTable({
  columns,
  rows,
  loading = false,
  error = null,
  emptyMessage,
  rowKey = (row) => row._id,
  skeletonRows = 5,
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-soft">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <thead className="bg-canvas/70 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-3 ${column.headClassName ?? ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {loading &&
            Array.from({ length: skeletonRows }, (_, index) => (
              <tr key={`skeleton-${index}`} aria-hidden="true">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-4">
                    <span className="block h-3 w-full max-w-28 animate-pulse rounded bg-canvas" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && error && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6">
                <Alert tone="error">{error}</Alert>
              </td>
            </tr>
          )}

          {!loading && !error && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">
                {emptyMessage}
              </td>
            </tr>
          )}

          {!loading &&
            !error &&
            rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-canvas/50">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle ${column.className ?? ''}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
