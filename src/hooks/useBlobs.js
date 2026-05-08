import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useBlob(store, key) {
  const queryClient = useQueryClient();
  const queryKey = ['blob', store, key];
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
    onSuccess: (_, value) => queryClient.setQueryData(queryKey, { store, key, value }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { ...query, save: mutation.mutateAsync, isSaving: mutation.isPending };
}
