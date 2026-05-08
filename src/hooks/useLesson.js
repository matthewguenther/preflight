import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useBlob } from './useBlobs';

async function fetchLesson() {
  try {
    const fsp = await apiFetch('/.netlify/functions/fsp');
    if (fsp.next_lesson) return { source: 'fsp', next_lesson: fsp.next_lesson, fetched_utc: fsp.fetched_utc };
  } catch (error) {
    if (!String(error.message).startsWith('404') && !String(error.message).startsWith('501')) throw error;
  }
  const manual = await apiFetch('/.netlify/functions/blobs?store=scheduling&key=next_lesson');
  return { source: 'manual', next_lesson: manual.value, fetched_utc: new Date().toISOString() };
}

export function useLesson() {
  const manual = useBlob('scheduling', 'next_lesson');
  const query = useQuery({
    queryKey: ['lesson'],
    queryFn: fetchLesson,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
  return { ...query, save: manual.save, isSaving: manual.isSaving };
}
