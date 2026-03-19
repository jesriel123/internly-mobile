import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabaseConfig';
import { getCachedTimeLogs, invalidateTimeLogsCache } from '../utils/timeLogsCache';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
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

  const dailyMax = user?.setup?.dailyMaxHours || 8;
  const weekend = isWeekend();

  // Clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = (await getCachedTimeLogs(user.uid))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setLogs(list);
      const key = todayKey();
      setTodayLog(list.find(l => l.date === key) || null);
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
      fetchLogs();
    }, [fetchLogs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs]);

  const handleTimeIn = async () => {
    if (weekend) { Alert.alert('No OJT today', 'No OJT today (Weekend)'); return; }
    if (isApproved) { Alert.alert('Already Approved', "Today's log has already been approved. No changes needed."); return; }
    if (todayLog?.timeIn) { Alert.alert('Already Clocked In', 'You have already clocked in for today.'); return; }
    setBusy(true);
    try {
      const key = todayKey();
      const now = new Date();
      const { error } = await supabase.from('time_logs').upsert([{
        user_id: user.uid,
        date: key,
        time_in: now.toISOString(),
        time_out: null,
        hours: null,
        status: 'pending',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }], { onConflict: 'user_id,date' });
      if (error) throw error;
      // Write audit log
      await supabase.from('audit_logs').insert([{
        user_id: user.uid,
        user_name: user.name || user.email,
        user_role: 'user',
        action: 'CLOCK_IN',
        details: `${user.name || user.email} clocked IN on ${key} at ${now.toLocaleTimeString()}`,
      }]);
      invalidateTimeLogsCache(user.uid);
      await fetchLogs();
      Alert.alert('Clocked In', `Time In recorded at ${now.toLocaleTimeString()}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setBusy(false); }
  };

  const handleTimeOut = async () => {
    if (weekend) { Alert.alert('No OJT today', 'No OJT today (Weekend)'); return; }
    if (isApproved) { Alert.alert('Already Approved', "Today's log has already been approved. No changes needed."); return; }
    if (!todayLog?.timeIn) { Alert.alert('No Time In', 'Please clock in first before clocking out.'); return; }
    if (todayLog?.timeOut) { Alert.alert('Already Clocked Out', 'You have already clocked out for today.'); return; }
    setBusy(true);
    try {
      const key = todayKey();
      const now = new Date();
      const timeInDate = new Date(todayLog.timeIn);
      let rawHours = (now - timeInDate) / (1000 * 60 * 60);
      let capped = false;
      if (rawHours > dailyMax) { capped = true; rawHours = dailyMax; }
      const hours = Math.round(rawHours * 100) / 100;

      const { error } = await supabase.from('time_logs')
        .update({ time_out: now.toISOString(), hours, status: 'pending', updated_at: now.toISOString() })
        .eq('user_id', user.uid)
        .eq('date', key);
      if (error) throw error;
      // Write audit log
      await supabase.from('audit_logs').insert([{
        user_id: user.uid,
        user_name: user.name || user.email,
        user_role: 'user',
        action: 'CLOCK_OUT',
        details: `${user.name || user.email} clocked OUT on ${key} at ${now.toLocaleTimeString()} — ${hours.toFixed(2)}h logged`,
      }]);
      invalidateTimeLogsCache(user.uid);
      await fetchLogs();
      if (capped) {
        Alert.alert('Overtime Notice', `Overtime hours will not be counted. Logged ${hours} hrs (capped at ${dailyMax}).`);
      } else {
        Alert.alert('Clocked Out', `Logged ${hours.toFixed(2)} hours today.`);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setBusy(false); }
  };

  const isApproved = todayLog?.status === 'approved';
  const isRejected = todayLog?.status === 'rejected';
  const clockedIn = !!todayLog?.timeIn;
  const clockedOut = !!todayLog?.timeOut;
  // Block any action if today's log is already approved
  const todayDone = isApproved || (clockedIn && clockedOut);

  // Format Time
  const timeString = currentTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }).split(' ');
  const hoursMinutesSeconds = timeString[0];
  const amPm = timeString[1];
  const clockDateStr = currentTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const headerDateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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
        <View style={[styles.clockCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.clockTime, { color: theme.text }]}>{hoursMinutesSeconds}</Text>
          <Text style={[styles.clockAmPm, { color: theme.text }]}>{amPm}</Text>
          <Text style={[styles.clockDate, { color: theme.textSecondary }]}>{clockDateStr}</Text>
        </View>

        {/* Buttons Row */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[
              styles.timeBtn,
              styles.timeInBtn,
              (weekend || clockedIn || todayDone || busy) && styles.btnDisabled
            ]}
            onPress={handleTimeIn}
            disabled={weekend || clockedIn || todayDone || busy}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.timeInText}>{clockedIn ? 'Clocked In' : 'Time In'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeBtn,
              { backgroundColor: theme.timeOutBtn },
              styles.timeOutElevation,
              (weekend || !clockedIn || clockedOut || todayDone || busy) && styles.btnDisabled
            ]}
            onPress={handleTimeOut}
            disabled={weekend || !clockedIn || clockedOut || todayDone || busy}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: '#F44336' }]} />
            <Text style={[styles.timeOutText, { color: theme.textSecondary }]}>{clockedOut ? 'Clocked Out' : 'Time Out'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.noticeText, { color: theme.textSecondary }]}>Max {dailyMax} hours/day • Monday–Friday only</Text>

        {/* Keep Today's log for transparency if they clocked in */}
        {todayLog && (
          <View style={[styles.todayCard, { backgroundColor: theme.todayCard }]}>
            <Text style={styles.todayLabel}>TODAY'S LOG</Text>
            <View style={styles.todayContent}>
              <View style={styles.todayItem}>
                <MaterialCommunityIcons name="clock-in" size={20} color={COLORS.primary} />
                <Text style={[styles.todayVal, { color: theme.text }]}>
                  {todayLog.timeIn ? (todayLog.timeIn.toDate ? todayLog.timeIn.toDate() : new Date(todayLog.timeIn)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </Text>
                <Text style={[styles.todaySub, { color: theme.textSecondary }]}>Time In</Text>
              </View>
              <View style={styles.todayItem}>
                <MaterialCommunityIcons name="clock-out" size={20} color="#F57C00" />
                <Text style={[styles.todayVal, { color: theme.text }]}>
                  {todayLog.timeOut ? (todayLog.timeOut.toDate ? todayLog.timeOut.toDate() : new Date(todayLog.timeOut)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
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
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: 50,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10,
  },
  clockTime: { fontSize: 52, fontWeight: 'bold', letterSpacing: 2, color: COLORS.text, fontFamily: 'monospace' },
  clockAmPm: { fontSize: 32, fontWeight: 'bold', color: COLORS.text, marginTop: -5, opacity: 0.8 },
  clockDate: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 16 },

  btnRow: { flexDirection: 'row', gap: 16, marginBottom: SPACING.md },
  timeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: BORDER_RADIUS.lg,
  },
  timeInBtn: { backgroundColor: COLORS.primary, elevation: 2, shadowColor: COLORS.primary, shadowOffset: {width:0, height:2}, shadowOpacity:0.3, shadowRadius:4 },
  timeOutElevation: { elevation: 1 },
  
  btnDisabled: { opacity: 0.5 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10, elevation: 2 },
  timeInText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  timeOutText: { color: COLORS.textSecondary, fontWeight: 'bold', fontSize: 16 },

  noticeText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.xl, fontWeight: '500' },

  todayCard: { backgroundColor: '#F3F0FF', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, elevation: 1 },
  todayLabel: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary, letterSpacing: 1, marginBottom: 12 },
  todayContent: { flexDirection: 'row', justifyContent: 'space-around' },
  todayItem: { alignItems: 'center' },
  todayVal: { fontSize: 15, fontWeight: 'bold', color: COLORS.text, marginTop: 4 },
  todaySub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
});
