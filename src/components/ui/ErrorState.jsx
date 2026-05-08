export function ErrorState({ title = 'Could not load data', error, onRetry }) {
  const auth = String(error?.message || '').startsWith('401');
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <div className="font-semibold">{auth ? 'Authentication error - check API_AUTH_TOKEN config.' : title}</div>
      {!auth && error ? <div className="mt-1 text-red-800">{error.message}</div> : null}
      {onRetry ? (
        <button className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
