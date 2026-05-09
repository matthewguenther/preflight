import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useBlob(store, key) {
  const queryClient = useQueryClient();
  const queryKey = ['blob', store, key];
  // Netlify Blobs are used as the app's tiny persistence layer. Reads return
  // { store, key, value }, but components only care about value.
  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/.netlify/functions/blobs?store=${encodeURIComponent(store)}&key=${encodeURIComponent(key)}`),
    select: (data) => data.value,
  });

  const mutation = useMutation({
    mutationFn: (value) => apiFetch('/.netlify/functions/blobs', {
      method: 'POST',
      body: JSON.stringify({ store, key, value }),
    }),
    // Optimistically put the saved value into the cache, then invalidate so any
    // server-side seed/default behavior is reconciled on the next fetch.
    onSuccess: (_, value) => queryClient.setQueryData(queryKey, { store, key, value }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { ...query, save: mutation.mutateAsync, isSaving: mutation.isPending };
}
