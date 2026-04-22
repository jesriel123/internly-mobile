import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabaseConfig';
import { createClockNotification } from './notificationHelper';

const STORAGE_KEY = 'internly_timelog_queue_v1';
const MAX_RETRIES = 20;
const PH_TIMEZONE = 'Asia/Manila';

function parseQueue(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function byCreatedAt(a, b) {
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function makeOperationId(op) {
  return `${op.uid}:${op.date}:${op.type}`;
}

async function readQueue() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return parseQueue(raw).sort(byCreatedAt);
}

async function writeQueue(items) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.sort(byCreatedAt)));
}

function toPhTimeLabel(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: PH_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

async function writeAuditLog({ uid, displayName, action, details }) {
  try {
    await supabase.from('audit_logs').insert([
      {
        user_id: uid,
        user_name: displayName,
        user_role: 'user',
        action,
        details,
      },
    ]);
  } catch (error) {
    console.warn('[offlineTimeLogQueue] audit log failed:', error?.message || error);
  }
}

async function syncClockIn(item) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('time_logs')
    .upsert(
      [
        {
          user_id: item.uid,
          date: item.date,
          time_in: item.timeInISO,
          time_out: null,
          hours: null,
          status: 'pending',
          created_at: item.createdAt || nowIso,
          updated_at: nowIso,
        },
      ],
      { onConflict: 'user_id,date' }
    )
    .select('id');

  if (error) throw error;

  const logId = data?.[0]?.id || item.logId || null;
  const displayName = item.userName || item.userEmail || item.uid;

  await writeAuditLog({
    uid: item.uid,
    displayName,
    action: 'CLOCK_IN',
    details: `${displayName} clocked IN on ${item.date} at ${toPhTimeLabel(item.timeInISO)} (PH)`,
  });

  try {
    await createClockNotification({
      type: 'clock_in',
      userId: item.uid,
      userName: displayName,
      userCompany: item.userCompany || '',
      logDate: item.date,
      logId,
      time: toPhTimeLabel(item.timeInISO),
    });
  } catch (error) {
    console.warn('[offlineTimeLogQueue] notification(clock_in) failed:', error?.message || error);
  }
}

async function syncClockOut(item) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('time_logs')
    .upsert(
      [
        {
          user_id: item.uid,
          date: item.date,
          time_in: item.timeInISO || null,
          time_out: item.timeOutISO,
          hours: item.hours,
          status: 'pending',
          updated_at: nowIso,
        },
      ],
      { onConflict: 'user_id,date' }
    )
    .select('id');

  if (error) throw error;

  const logId = data?.[0]?.id || item.logId || null;
  const displayName = item.userName || item.userEmail || item.uid;

  await writeAuditLog({
    uid: item.uid,
    displayName,
    action: 'CLOCK_OUT',
    details: `${displayName} clocked OUT on ${item.date} at ${toPhTimeLabel(item.timeOutISO)} (PH) - ${Number(item.hours || 0).toFixed(2)}h logged`,
  });

  try {
    await createClockNotification({
      type: 'clock_out',
      userId: item.uid,
      userName: displayName,
      userCompany: item.userCompany || '',
      logDate: item.date,
      logId,
      time: toPhTimeLabel(item.timeOutISO),
      hours: Number(item.hours || 0).toFixed(2),
    });
  } catch (error) {
    console.warn('[offlineTimeLogQueue] notification(clock_out) failed:', error?.message || error);
  }
}

export async function enqueueTimeLogOperation(operation) {
  const nowIso = new Date().toISOString();
  const queue = await readQueue();
  const nextItem = {
    id: makeOperationId(operation),
    type: operation.type,
    uid: operation.uid,
    date: operation.date,
    timeInISO: operation.timeInISO || null,
    timeOutISO: operation.timeOutISO || null,
    hours: operation.hours ?? null,
    userName: operation.userName || '',
    userEmail: operation.userEmail || '',
    userCompany: operation.userCompany || '',
    logId: operation.logId || null,
    createdAt: operation.createdAt || nowIso,
    updatedAt: nowIso,
    retryCount: 0,
    lastError: null,
    status: 'pending',
  };

  const filtered = queue.filter((item) => item.id !== nextItem.id);
  filtered.push(nextItem);
  await writeQueue(filtered);
  return nextItem;
}

export async function getPendingTimeLogOperations(uid) {
  const queue = await readQueue();
  return uid ? queue.filter((item) => item.uid === uid) : queue;
}

export function applyPendingOperationsToLogs(baseLogs, pendingOps) {
  const byDate = new Map();
  (baseLogs || []).forEach((log) => {
    byDate.set(log.date, { ...log, offlinePending: false });
  });

  (pendingOps || []).sort(byCreatedAt).forEach((operation) => {
    const existing = byDate.get(operation.date) || {
      id: `local-${operation.uid}-${operation.date}`,
      date: operation.date,
      timeIn: null,
      timeOut: null,
      hours: null,
      status: 'pending',
      logType: null,
      createdAt: operation.createdAt,
      offlinePending: true,
    };

    if (operation.type === 'clock_in') {
      existing.timeIn = operation.timeInISO;
      existing.timeOut = null;
      existing.hours = null;
    }

    if (operation.type === 'clock_out') {
      if (!existing.timeIn && operation.timeInISO) {
        existing.timeIn = operation.timeInISO;
      }
      existing.timeOut = operation.timeOutISO;
      existing.hours = operation.hours;
    }

    existing.status = 'pending';
    existing.offlinePending = true;
    byDate.set(operation.date, existing);
  });

  return Array.from(byDate.values()).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function flushTimeLogQueue({ uid } = {}) {
  const queue = await readQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, pendingCount: 0, lastError: null };
  }

  const nextQueue = [...queue];
  let syncedCount = 0;
  let lastError = null;

  for (const item of queue) {
    if (uid && item.uid !== uid) continue;
    if (item.status === 'failed' && item.retryCount >= MAX_RETRIES) continue;

    try {
      if (item.type === 'clock_in') {
        await syncClockIn(item);
      } else if (item.type === 'clock_out') {
        await syncClockOut(item);
      }

      const removeIndex = nextQueue.findIndex((queued) => queued.id === item.id);
      if (removeIndex >= 0) {
        nextQueue.splice(removeIndex, 1);
      }
      syncedCount += 1;
    } catch (error) {
      lastError = error?.message || 'Sync failed';
      const updateIndex = nextQueue.findIndex((queued) => queued.id === item.id);
      if (updateIndex >= 0) {
        const retryCount = Number(nextQueue[updateIndex].retryCount || 0) + 1;
        nextQueue[updateIndex] = {
          ...nextQueue[updateIndex],
          retryCount,
          updatedAt: new Date().toISOString(),
          lastError,
          status: retryCount >= MAX_RETRIES ? 'failed' : 'pending',
        };
      }
    }
  }

  await writeQueue(nextQueue);

  const pendingCount = nextQueue.filter((item) => {
    if (uid && item.uid !== uid) return false;
    return item.status !== 'failed';
  }).length;

  return {
    syncedCount,
    pendingCount,
    lastError,
  };
}
