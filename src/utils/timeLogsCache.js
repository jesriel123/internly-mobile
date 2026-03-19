import { supabase } from '../../supabaseConfig';

const TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map();
const pending = new Map();

export async function getCachedTimeLogs(uid) {
  const entry = cache.get(uid);
  if (entry && Date.now() - entry.ts < TTL) return entry.data;
  if (pending.has(uid)) return pending.get(uid);

  const promise = supabase
    .from('time_logs')
    .select('*')
    .eq('user_id', uid)
    .order('date', { ascending: false })
    .then(({ data, error }) => {
      if (error) throw error;
      const normalized = (data || []).map(row => ({
        id: row.id,
        date: row.date,
        timeIn: row.time_in,
        timeOut: row.time_out,
        hours: row.hours,
        status: row.status || 'pending',
        logType: row.log_type || null,
        createdAt: row.created_at,
      }));
      cache.set(uid, { data: normalized, ts: Date.now() });
      return normalized;
    })
    .finally(() => pending.delete(uid));

  pending.set(uid, promise);
  return promise;
}

export function invalidateTimeLogsCache(uid) {
  if (uid) { cache.delete(uid); pending.delete(uid); }
  else { cache.clear(); pending.clear(); }
}
