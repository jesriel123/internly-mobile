import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, RefreshControl, Platform, Modal } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedTimeLogs, invalidateTimeLogsCache } from '../utils/timeLogsCache';
import {
  enqueueTimeLogOperation,
  flushTimeLogQueue,
  getPendingTimeLogOperations,
  applyPendingOperationsToLogs,
} from '../utils/offlineTimeLogQueue';

const PH_TIMEZONE = 'Asia/Manila';

function getPHDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  return { year, month, day };
}

function todayKey(date = new Date()) {
  const { year, month, day } = getPHDateParts(date);
  return `${year}-${month}-${day}`;
}

function isWeekend(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TIMEZONE,
    weekday: 'short',
  }).format(date);
  return weekday === 'Sat' || weekday === 'Sun';
}

function getPHWorkStartBoundary(dateKey) {
  // 8:00 AM Asia/Manila is 00:00 UTC for the same calendar date.
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export default function TimeLogScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const [logs, setLogs] = useState([]);
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [feedbackModal, setFeedbackModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  const syncingRef = useRef(false);

  const dailyMax = user?.setup?.dailyMaxHours || 8;
  const weekend = isWeekend(currentTime);

  // Clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const syncQueuedLogs = useCallback(async () => {
    if (!user?.uid || syncingRef.current) {
      return { syncedCount: 0, pendingCount: 0, lastError: null };
    }

    syncingRef.current = true;
    try {
      const result = await flushTimeLogQueue({ uid: user.uid });
      setPendingSyncCount(result.pendingCount);
      if (result.syncedCount > 0) {
        invalidateTimeLogsCache(user.uid);
      }
      return result;
    } finally {
      syncingRef.current = false;
    }
  }, [user?.uid]);

  const fetchLogs = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = await getCachedTimeLogs(user.uid);
      const pendingOps = await getPendingTimeLogOperations(user.uid);
      const merged = applyPendingOperationsToLogs(list, pendingOps);

      setPendingSyncCount(pendingOps.length);
      setLogs(merged);
      const key = todayKey();
      setTodayLog(merged.find(l => l.date === key) || null);
    } catch (e) {
      console.error('Failed to fetch time logs:', e);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
  }, [fetchLogs]);

  // Re-fetch on tab focus so approved/rejected status is always current
  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const refreshWithSync = async () => {
        await syncQueuedLogs();
        if (mounted) {
          await fetchLogs();
        }
      };

      refreshWithSync();
      return () => {
        mounted = false;
      };
    }, [fetchLogs, syncQueuedLogs])
  );

  useEffect(() => {
    if (!user?.uid) return undefined;
    const interval = setInterval(async () => {
      const result = await syncQueuedLogs();
      if (result.syncedCount > 0) {
        await fetchLogs();
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [user?.uid, syncQueuedLogs, fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncQueuedLogs();
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs, syncQueuedLogs]);

  const showFeedback = (title, message, type = 'info') => {
    setFeedbackModal({
      visible: true,
      title,
      message,
      type,
    });
  };

  const closeFeedbackModal = () => {
    setFeedbackModal(prev => ({ ...prev, visible: false }));
  };

  const handleTimeIn = async () => {
    if (weekend) { showFeedback('No OJT today', 'No OJT today (Weekend)', 'warning'); return; }
    if (isApproved) { showFeedback('Already Approved', "Today's log has already been approved. No changes needed.", 'warning'); return; }
    if (todayLog?.timeIn) { showFeedback('Already Clocked In', 'You have already clocked in for today.', 'warning'); return; }
    setBusy(true);
    try {
      const key = todayKey();
      const now = new Date();
      const nowTimePH = now.toLocaleTimeString('en-US', {
        timeZone: PH_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      await enqueueTimeLogOperation({
        type: 'clock_in',
        uid: user.uid,
        date: key,
        timeInISO: now.toISOString(),
        userName: user.name || user.email,
        userEmail: user.email || '',
        userCompany: user.company || '',
      });

      const syncResult = await syncQueuedLogs();
      await fetchLogs();

      if (syncResult.pendingCount > 0) {
        showFeedback('Saved Offline', `Time In saved at ${nowTimePH} (PH). It will auto-sync when internet is back.`, 'info');
      } else {
        showFeedback('Clocked In', `Time In recorded at ${nowTimePH} (PH)`, 'success');
      }
    } catch (e) {
      showFeedback('Error', e?.message || 'Something went wrong while clocking in.', 'error');
    } finally { setBusy(false); }
  };

  const handleTimeOut = async () => {
    if (weekend) { showFeedback('No OJT today', 'No OJT today (Weekend)', 'warning'); return; }
    if (isApproved) { showFeedback('Already Approved', "Today's log has already been approved. No changes needed.", 'warning'); return; }
    if (!todayLog?.timeIn) { showFeedback('No Time In', 'Please clock in first before clocking out.', 'warning'); return; }
    if (todayLog?.timeOut) { showFeedback('Already Clocked Out', 'You have already clocked out for today.', 'warning'); return; }
    setBusy(true);
    try {
      const key = todayKey();
      const now = new Date();
      const timeInDate = new Date(todayLog.timeIn);
      const workStartBoundary = getPHWorkStartBoundary(key);
      const effectiveStart = timeInDate < workStartBoundary ? workStartBoundary : timeInDate;
      let rawHours = (now - effectiveStart) / (1000 * 60 * 60);
      if (rawHours < 0) rawHours = 0;
      let capped = false;
      if (rawHours > dailyMax) { capped = true; rawHours = dailyMax; }
      const hours = Math.round(rawHours * 100) / 100;

      const nowTimePH = now.toLocaleTimeString('en-US', {
        timeZone: PH_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      await enqueueTimeLogOperation({
        type: 'clock_out',
        uid: user.uid,
        date: key,
        timeInISO: todayLog.timeIn,
        timeOutISO: now.toISOString(),
        hours,
        userName: user.name || user.email,
        userEmail: user.email || '',
        userCompany: user.company || '',
        logId: todayLog.id || null,
      });

      const syncResult = await syncQueuedLogs();
      await fetchLogs();

      if (syncResult.pendingCount > 0) {
        showFeedback('Saved Offline', `Time Out saved at ${nowTimePH} (PH). It will auto-sync when internet is back.`, 'info');
      } else if (capped) {
        showFeedback('Overtime Notice', `Overtime hours will not be counted. Logged ${hours} hrs (capped at ${dailyMax}).`, 'warning');
      } else {
        showFeedback('Clocked Out', `Logged ${hours.toFixed(2)} hours today.`, 'success');
      }
    } catch (e) {
      showFeedback('Error', e?.message || 'Something went wrong while clocking out.', 'error');
    } finally { setBusy(false); }
  };

  const isApproved = todayLog?.status === 'approved';
  const isRejected = todayLog?.status === 'rejected';
  const clockedIn = !!todayLog?.timeIn;
  const clockedOut = !!todayLog?.timeOut;
  // Block any action if today's log is already approved
  const todayDone = isApproved || (clockedIn && clockedOut);

  // Format Time
  const timeString = currentTime.toLocaleTimeString('en-US', {
    timeZone: PH_TIMEZONE,
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).split(' ');
  const hoursMinutesSeconds = timeString[0];
  const amPm = timeString[1];
  const clockDateStr = currentTime.toLocaleDateString('en-US', {
    timeZone: PH_TIMEZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const headerDateStr = currentTime.toLocaleDateString('en-US', {
    timeZone: PH_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Time Log</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{headerDateStr}</Text>
        </View>

        {/* Big Digital Clock Card */}
        <View style={[styles.clockCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <View style={styles.clockTimeWrapper}>
            <Text style={[styles.clockTime, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {hoursMinutesSeconds}
            </Text>
            <Text style={[styles.clockAmPm, { color: theme.text }]}>{amPm}</Text>
          </View>
          <Text style={[styles.clockDateStr, { color: theme.textSecondary }]}>{clockDateStr}</Text>
        </View>

        {/* Buttons Row */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[
              styles.timeBtn,
              { backgroundColor: (weekend || clockedIn || todayDone || busy) ? '#4338CA' : '#6366F1' },
              (weekend || clockedIn || todayDone || busy) && styles.btnDisabled
            ]}
            onPress={handleTimeIn}
            disabled={weekend || clockedIn || todayDone || busy}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: '#4ADE80' }]} />
            <Text style={styles.timeInText}>{clockedIn ? 'Clocked In' : 'Time In'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeBtn,
              { backgroundColor: isDark ? '#1C1C1E' : '#F1F5F9' },
              styles.timeOutElevation,
              (weekend || !clockedIn || clockedOut || todayDone || busy) && styles.btnDisabled
            ]}
            onPress={handleTimeOut}
            disabled={weekend || !clockedIn || clockedOut || todayDone || busy}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.timeOutText, { color: theme.textSecondary }]}>{clockedOut ? 'Clocked Out' : 'Time Out'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.noticeText, { color: theme.textSecondary }]}>Max {dailyMax} hours/day • Monday–Friday only</Text>
        {pendingSyncCount > 0 && (
          <Text style={[styles.noticeText, { color: '#F59E0B', marginTop: -8 }]}>Pending sync: {pendingSyncCount} change{pendingSyncCount > 1 ? 's' : ''}</Text>
        )}

        {/* Keep Today's log for transparency if they clocked in */}
        {todayLog && (
          <View style={[styles.todayCard, { backgroundColor: theme.todayCard }]}>
            <Text style={styles.todayLabel}>TODAY'S LOG</Text>
            <View style={styles.todayContent}>
              <View style={styles.todayItem}>
                <MaterialCommunityIcons name="clock-in" size={20} color={COLORS.primary} />
                <Text style={[styles.todayVal, { color: theme.text }]}>
                  {todayLog.timeIn
                    ? (todayLog.timeIn.toDate ? todayLog.timeIn.toDate() : new Date(todayLog.timeIn)).toLocaleTimeString('en-US', {
                        timeZone: PH_TIMEZONE,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '—'}
                </Text>
                <Text style={[styles.todaySub, { color: theme.textSecondary }]}>Time In</Text>
              </View>
              <View style={styles.todayItem}>
                <MaterialCommunityIcons name="clock-out" size={20} color="#F57C00" />
                <Text style={[styles.todayVal, { color: theme.text }]}>
                  {todayLog.timeOut
                    ? (todayLog.timeOut.toDate ? todayLog.timeOut.toDate() : new Date(todayLog.timeOut)).toLocaleTimeString('en-US', {
                        timeZone: PH_TIMEZONE,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '—'}
                </Text>
                <Text style={[styles.todaySub, { color: theme.textSecondary }]}>Time Out</Text>
              </View>
              <View style={styles.todayItem}>
                <MaterialCommunityIcons name="timer-outline" size={20} color="#4CAF50" />
                <Text style={[styles.todayVal, { color: theme.text }]}>{todayLog.hours != null ? Number(todayLog.hours).toFixed(2) : '—'}</Text>
                <Text style={[styles.todaySub, { color: theme.textSecondary }]}>Hours</Text>
              </View>
            </View>
          </View>
        )}

        <Modal
          visible={feedbackModal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeFeedbackModal}
        >
          <TouchableOpacity style={styles.feedbackOverlay} activeOpacity={1} onPress={closeFeedbackModal}>
            <TouchableOpacity style={styles.feedbackCard} activeOpacity={1} onPress={() => {}}>
              <View style={styles.feedbackHeaderRow}>
                <View
                  style={[
                    styles.feedbackIcon,
                    feedbackModal.type === 'success'
                      ? styles.feedbackIconSuccess
                      : feedbackModal.type === 'error'
                        ? styles.feedbackIconError
                        : styles.feedbackIconInfo,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      feedbackModal.type === 'success'
                        ? 'check-bold'
                        : feedbackModal.type === 'error'
                          ? 'alert-circle-outline'
                          : 'information-outline'
                    }
                    size={16}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.feedbackTitle}>{feedbackModal.title}</Text>
              </View>

              <Text style={styles.feedbackMessage}>{feedbackModal.message}</Text>

              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  feedbackModal.type === 'success'
                    ? styles.feedbackButtonSuccess
                    : feedbackModal.type === 'error'
                      ? styles.feedbackButtonError
                      : styles.feedbackButtonInfo,
                ]}
                onPress={closeFeedbackModal}
              >
                <Text style={styles.feedbackButtonText}>OK</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg, paddingTop: 60 },
  
  header: { marginBottom: SPACING.xl },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary },

  clockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 56,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    elevation: 3,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 10,
  },
  clockTimeWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  clockTime: { 
    fontSize: 56, 
    fontWeight: '800', 
    letterSpacing: 2, 
    color: '#000', 
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    includeFontPadding: false 
  },
  clockAmPm: { 
    fontSize: 24, 
    fontWeight: '800', 
    color: '#000', 
    marginLeft: 8,
    includeFontPadding: false
  },
  clockDateStr: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#666', 
    marginTop: 20,
    letterSpacing: 0.5 
  },

  btnRow: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  timeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, borderRadius: 20,
  },
  timeInBtn: { elevation: 0 },
  timeOutElevation: { elevation: 0 },
  
  btnDisabled: { opacity: 0.6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  timeInText: { color: 'white', fontWeight: '800', fontSize: 17 },
  timeOutText: { color: '#64748B', fontWeight: '800', fontSize: 17 },

  noticeText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.xl, fontWeight: '500' },

  todayCard: { backgroundColor: '#F3F0FF', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, elevation: 1 },
  todayLabel: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary, letterSpacing: 1, marginBottom: 12 },
  todayContent: { flexDirection: 'row', justifyContent: 'space-around' },
  todayItem: { alignItems: 'center' },
  todayVal: { fontSize: 15, fontWeight: 'bold', color: COLORS.text, marginTop: 4 },
  todaySub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 12, 38, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: '#20144A',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  feedbackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  feedbackIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  feedbackIconSuccess: {
    backgroundColor: '#2FA56A',
  },
  feedbackIconError: {
    backgroundColor: '#E45757',
  },
  feedbackIconInfo: {
    backgroundColor: COLORS.primary,
  },
  feedbackTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F1A43',
  },
  feedbackMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: '#524D77',
    marginBottom: 16,
  },
  feedbackButton: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  feedbackButtonSuccess: {
    backgroundColor: '#2FA56A',
  },
  feedbackButtonError: {
    backgroundColor: '#E45757',
  },
  feedbackButtonInfo: {
    backgroundColor: COLORS.primary,
  },
  feedbackButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
