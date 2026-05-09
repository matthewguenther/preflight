import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useBlob } from './useBlobs';

async function fetchLesson() {
  try {
    // Preferred future path: Flight Schedule Pro supplies the next lesson. The
    // current fsp function is a safe placeholder until credentials/API details exist.
    const fsp = await apiFetch('/.netlify/functions/fsp');
    if (fsp.next_lesson) return { source: 'fsp', next_lesson: fsp.next_lesson, fetched_utc: fsp.fetched_utc };
  } catch (error) {
    if (!String(error.message).startsWith('404') && !String(error.message).startsWith('501')) throw error;
  }
  // Fallback path: read the manually edited scheduling blob.
  const manual = await apiFetch('/.netlify/functions/blobs?store=scheduling&key=next_lesson');
  return { source: 'manual', next_lesson: manual.value, fetched_utc: new Date().toISOString() };
}

export function useLesson() {
  // Expose one hook contract to panels: query fields for reading plus save()
  // for editing the manual fallback.
  const manual = useBlob('scheduling', 'next_lesson');
  const query = useQuery({
    queryKey: ['lesson'],
    queryFn: fetchLesson,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
  return { ...query, save: manual.save, isSaving: manual.isSaving };
}
