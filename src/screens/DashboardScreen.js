import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, StatusBar, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import ProgressBar from '../components/ProgressBar';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { getCachedTimeLogs, invalidateTimeLogsCache } from '../utils/timeLogsCache';

function getDatesDifference(remainingHours, dailyMaxHours) {
  if (remainingHours <= 0) return 'Completed! 🎉';
  const workdaysNeeded = Math.ceil(remainingHours / dailyMaxHours);
  const date = new Date();
  let count = 0;
  while (count < workdaysNeeded) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toTime(ts) {
  if (!ts) return null;
  return (ts.toDate ? ts.toDate() : new Date(ts));
}

function classifyLog(hours, dailyMax) {
  if (hours == null) return 'absent';
  const h = Number(hours);
  if (h > dailyMax) return 'overtime';
  if (h >= dailyMax) return 'present';
  if (h >= dailyMax / 2) return 'earlyOut';
  return 'halfDay';
}

function getHeroGradient(hour, isDark) {
  if (isDark) {
    if (hour < 12) return ['#1E3A8A', '#312E81', '#4C1D95'];
    if (hour < 17) return ['#1D4ED8', '#4338CA', '#6D28D9'];
    return ['#0F172A', '#1E1B4B', '#312E81'];
  }
  if (hour < 12) return ['#2563EB', '#4F46E5', '#7C3AED'];
  if (hour < 17) return ['#0EA5E9', '#2563EB', '#4F46E5'];
  return ['#1D4ED8', '#4338CA', '#7C3AED'];
}

function getHeroStatus(progress, remainingHours, pendingHours) {
  if (progress >= 100) return 'Target completed. Keep logging for your records.';
  if (pendingHours > 0) return `${pendingHours.toFixed(1)}h pending approval.`;
  if (remainingHours <= 40) return 'Final stretch. You are almost done.';
  return 'Keep your momentum strong this week.';
}

function computeAttendance(logs, startDate, dailyMax) {
  const logMap = {};
  logs.forEach(l => { logMap[l.date] = l; });

  let present = 0, absent = 0, halfDay = 0, earlyOut = 0, overtime = 0;

  if (startDate) {
    const start = new Date(startDate.includes('T') ? startDate : startDate + 'T00:00:00');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    // If startDate is in the future or invalid, fall back to counting all logs
    if (isNaN(start.getTime()) || start > today) {
      logs.forEach(l => {
        if (l.status === 'approved') {
          const type = l.logType || classifyLog(l.hours, dailyMax);
          if (type === 'present') present++;
          else if (type === 'overtime') overtime++;
          else if (type === 'halfDay') halfDay++;
          else if (type === 'earlyOut') earlyOut++;
        }
      });
      return { present, absent, halfDay, earlyOut, overtime };
    }
    const d = new Date(start);
    while (d <= today) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const log = logMap[key];
        if (!log || log.status === 'rejected') {
          absent++;
        } else if (log.status === 'approved') {
          const type = log.logType || classifyLog(log.hours, dailyMax);
          if (type === 'present') present++;
          else if (type === 'overtime') overtime++;
          else if (type === 'halfDay') halfDay++;
          else if (type === 'earlyOut') earlyOut++;
          else absent++;
        } else {
          // pending — count as absent for now
          absent++;
        }
      }
      d.setDate(d.getDate() + 1);
    }
  } else {
    logs.forEach(l => {
      if (l.status === 'approved') {
        const type = l.logType || classifyLog(l.hours, dailyMax);
        if (type === 'present') present++;
        else if (type === 'overtime') overtime++;
        else if (type === 'halfDay') halfDay++;
        else if (type === 'earlyOut') earlyOut++;
      }
    });
  }
  return { present, absent, halfDay, earlyOut, overtime };
}

const LOG_TYPE_CONFIG = {
  present:  { label: 'Present',   icon: 'check-circle',       color: '#7C3AED', bg: '#EDE9FE' },
  earlyOut: { label: 'Early Out', icon: 'clock-alert-outline', color: '#3B82F6', bg: '#DBEAFE' },
  halfDay:  { label: 'Half Day',  icon: 'circle-half-full',    color: '#F59E0B', bg: '#FEF3C7' },
  absent:   { label: 'Absent',    icon: 'close-circle',        color: '#EF4444', bg: '#FEE2E2' },
};

export default function DashboardScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [ojtData, setOjtData] = useState({ renderedHours: 0, pendingHours: 0, recentLogs: [], attendance: { present: 0, absent: 0, halfDay: 0, earlyOut: 0, overtime: 0 } });
  const [loading, setLoading] = useState(true);
  const lastFetchRef = React.useRef(0);

  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const allLogs = await getCachedTimeLogs(user.uid);

      let rendered = 0;
      let pending = 0;

      allLogs.forEach(data => {
        if (data.status === 'approved' && data.hours != null) rendered += Number(data.hours);
        else if (data.status === 'pending' && data.hours != null) pending += Number(data.hours);
      });

      const logs = [...allLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const dailyMax = user?.setup?.dailyMaxHours || 8;
      const attendance = computeAttendance(logs, user?.startDate, dailyMax);

      setOjtData({ renderedHours: rendered, pendingHours: pending, recentLogs: logs.slice(0, 3), attendance });
    } catch (e) {
      console.error('Failed to fetch OJT data:', e);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Only fetch if 30 seconds have passed since last fetch
      if (now - lastFetchRef.current > 30000) {
        lastFetchRef.current = now;
        fetchData();
      }
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    if (user?.uid) invalidateTimeLogsCache(user.uid);
    await fetchData();
    setRefreshing(false);
  }, [refreshing, fetchData, user?.uid]);

  const required = user?.setup?.requiredHours || 486;
  const dailyMax = user?.setup?.dailyMaxHours || 8;
  const rendered = ojtData.renderedHours;
  const remaining = Math.max(0, required - rendered);
  const progress = required > 0 ? Math.min(100, (rendered / required) * 100) : 0;
  const ecd = getDatesDifference(remaining, dailyMax);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || 'Intern').split(' ')[0];
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const heroGradient = getHeroGradient(hour, isDark);
  const heroStatus = getHeroStatus(progress, remaining, ojtData.pendingHours);
  const userInitial = firstName ? firstName.charAt(0).toUpperCase() : 'I';

  const { present, absent, halfDay, earlyOut, overtime } = ojtData.attendance;
  const totalDays = present + absent + halfDay + earlyOut + overtime;
  const maxAttendance = Math.max(present, absent, halfDay, earlyOut, overtime, 1);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Hero Header */}
        <LinearGradient
          colors={heroGradient}
          style={[styles.heroCard, { shadowColor: isDark ? '#000' : '#4338CA' }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroOrbPrimary} />
          <View style={styles.heroOrbSecondary} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="sparkles" size={13} color="#EEF2FF" />
              <Text style={styles.heroBadgeText}>Internly Dashboard</Text>
            </View>
            <Text style={styles.heroPercentText}>{progress.toFixed(0)}%</Text>
          </View>

          <View style={styles.heroIdentityRow}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{userInitial}</Text>
            </View>
            <View style={styles.heroIdentityText}>
              <Text style={styles.heroGreeting}>{greeting} 👋</Text>
              <Text style={styles.heroName}>{firstName}</Text>
              <View style={styles.heroDateRow}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroDate}>{todayStr}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.heroSubline}>{heroStatus}</Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatValue}>{rendered.toFixed(1)}h</Text>
              <Text style={styles.heroStatLabel}>Rendered</Text>
            </View>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatValue}>{ojtData.pendingHours.toFixed(1)}h</Text>
              <Text style={styles.heroStatLabel}>Pending</Text>
            </View>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatValue}>{remaining.toFixed(1)}h</Text>
              <Text style={styles.heroStatLabel}>Left</Text>
            </View>
          </View>

          <View style={styles.heroActionsRow}>
            <TouchableOpacity style={styles.heroActionButton} onPress={() => navigation.navigate('TimeLog')}>
              <MaterialCommunityIcons name="clock-plus-outline" size={14} color="#FFFFFF" />
              <Text style={styles.heroActionText}>Log Time</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroActionButtonGhost} onPress={() => navigation.navigate('History')}>
              <MaterialCommunityIcons name="history" size={14} color="#FFFFFF" />
              <Text style={styles.heroActionText}>View History</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Top Row: Main Stats + Attendance Summary */}
        <View style={styles.topRow}>
          {/* Main Stats Card */}
          <View style={[styles.topCard, { backgroundColor: theme.surface, borderColor: isDark ? '#2B2B31' : '#ECEBFF' }]}> 
            <View style={styles.circleProgressContainerSm}>
              <View style={[styles.circleRingSm, { borderTopColor: COLORS.primary, borderRightColor: COLORS.primary, borderBottomColor: theme.accent, borderLeftColor: theme.accent }]} />
              <View style={[styles.circleInnerSm, { backgroundColor: theme.surface }]}>
                <Text style={[styles.circlePercent, { color: theme.text, fontSize: 16 }]}>{progress.toFixed(0)}%</Text>
                <Text style={[styles.circleSub, { color: theme.textSecondary }]}>done</Text>
              </View>
            </View>
            <View style={styles.hoursDetailsVertical}>
              <View style={styles.hourItemSm}>
                <Text style={[styles.hourLabel, { color: theme.textSecondary }]}>Required</Text>
                <Text style={[styles.hourValSm, { color: theme.text }]}>{required}h</Text>
              </View>
              <View style={styles.hourItemSm}>
                <Text style={[styles.hourLabel, { color: theme.textSecondary }]}>Rendered</Text>
                <Text style={[styles.hourValSm, { color: COLORS.primary }]}>{rendered.toFixed(1)}h</Text>
              </View>
              <View style={styles.hourItemSm}>
                <Text style={[styles.hourLabel, { color: theme.textSecondary }]}>Remaining</Text>
                <Text style={[styles.hourValSm, { color: '#EF4444' }]}>{remaining.toFixed(1)}h</Text>
              </View>
            </View>
          </View>

          {/* Attendance Summary Bar Chart */}
          <View style={[styles.topCard, { backgroundColor: theme.surface, borderColor: isDark ? '#2B2B31' : '#ECEBFF' }]}> 
            <Text style={[styles.attendanceSummaryTitle, { color: theme.text }]}>Attendance{'\n'}Summary</Text>
            <View style={styles.barChart}>
              {[
                { key: 'present',  count: present,  color: '#7C3AED', label: 'Pres' },
                { key: 'absent',   count: absent,   color: '#EF4444', label: 'Abs' },
                { key: 'halfDay',  count: halfDay,  color: '#F59E0B', label: 'Half' },
                { key: 'earlyOut', count: earlyOut, color: '#3B82F6', label: 'Early' },
                { key: 'overtime', count: overtime, color: '#10B981', label: 'OT' },
              ].map(item => {
                const barH = Math.max(4, (item.count / maxAttendance) * 60);
                return (
                  <View key={item.key} style={styles.barColumn}>
                    <Text style={[styles.barCount, { color: item.color }]}>{item.count}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { height: barH, backgroundColor: item.color }]} />
                    </View>
                    <Text style={[styles.barLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Estimated Completion Card */}
        <LinearGradient colors={COLORS.gradient} style={styles.ecdCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.ecdTopRow}>
            <MaterialCommunityIcons name="calendar-month-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.ecdLabel}> Estimated Completion</Text>
          </View>
          <View style={styles.ecdBottomRow}>
            <Text style={styles.ecdDate}>{loading ? 'Calculating...' : ecd}</Text>
            <MaterialCommunityIcons name="school-outline" size={50} color="rgba(255,255,255,0.2)" style={styles.ecdIcon} />
          </View>
        </LinearGradient>

        {/* Overall Progress Bar */}
        <View style={[styles.progressSection, { backgroundColor: theme.surface, borderColor: isDark ? '#2B2B31' : '#EEF0F5' }]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>Overall Progress</Text>
            <Text style={styles.progressValue}>{progress.toFixed(1)}%</Text>
          </View>
          <ProgressBar progress={progress} color={COLORS.primary} trackColor={isDark ? '#2D2856' : '#e0e0e0'} height={8} showPercentage={false} />
        </View>

        {/* Recent Logs */}
        <View style={styles.recentHeader}>
          <Text style={[styles.recentTitle, { color: theme.text }]}>Recent Logs</Text>
          {ojtData.recentLogs.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('History')}>
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.logsList}>
          {ojtData.recentLogs.length === 0 ? (
            <Text style={[styles.noLogsText, { color: theme.textSecondary }]}>{loading ? 'Loading logs...' : 'No logs recorded yet.'}</Text>
          ) : (
            ojtData.recentLogs.map((log) => {
              const timeInDate = toTime(log.timeIn);
              const timeOutDate = toTime(log.timeOut);
              const startStr = timeInDate ? timeInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
              const endStr = timeOutDate ? timeOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing';
              const logType = classifyLog(log.status === 'approved' ? log.hours : null, dailyMax);
              const typeConfig = LOG_TYPE_CONFIG[logType] || LOG_TYPE_CONFIG.present;

              return (
                <View key={log.id} style={[styles.logCard, { backgroundColor: theme.surface, borderColor: isDark ? '#2B2B31' : '#EEF0F5' }]}> 
                  <View style={styles.logLeft}>
                    <View style={styles.logDateRow}>
                      <Text style={[styles.logDate, { color: theme.text }]}>{formatDate(log.date)}</Text>
                      <View style={[styles.logTypeBadge, { backgroundColor: typeConfig.bg }]}>
                        <Text style={[styles.logTypeText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.logTime, { color: theme.textSecondary }]}>
                      {startStr} – {endStr}
                    </Text>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={[styles.logHours, { color: COLORS.primary }]}>
                      {log.hours != null ? parseFloat(log.hours).toFixed(2) + 'h' : '--'}
                    </Text>
                    <View style={[styles.statusBadge, {
                      backgroundColor: log.status === 'approved' ? '#D1FAE5' : log.status === 'pending' ? '#FEF3C7' : '#FEE2E2'
                    }]}>
                      <Text style={[styles.statusText, {
                        color: log.status === 'approved' ? '#10B981' : log.status === 'pending' ? '#F59E0B' : '#EF4444'
                      }]}>
                        {log.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg },

  heroCard: {
    borderRadius: 28,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    elevation: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  heroOrbPrimary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.12)',
    right: -70,
    top: -70,
  },
  heroOrbSecondary: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    left: -45,
    bottom: -45,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  heroPercentText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroAvatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroIdentityText: {
    marginLeft: 12,
    flex: 1,
  },
  heroGreeting: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  heroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroDate: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    flexShrink: 1,
  },
  heroSubline: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    marginBottom: 12,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  heroStatPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 9,
    alignItems: 'center',
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroActionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroActionButtonGhost: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  heroActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  topRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  topCard: {
    flex: 1, borderRadius: 22, padding: SPACING.md, borderWidth: 1,
    elevation: 4, shadowColor: '#111827', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 10,
    alignItems: 'center',
  },
  circleProgressContainerSm: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  circleRingSm: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    borderWidth: 8, transform: [{ rotate: '-45deg' }]
  },
  circleInnerSm: { justifyContent: 'center', alignItems: 'center', width: 64, height: 64, borderRadius: 32 },
  hoursDetailsVertical: { width: '100%' },
  hourItemSm: { marginBottom: 6, alignItems: 'center' },
  hourLabel: { fontSize: 11, marginBottom: 1 },
  hourValSm: { fontSize: 14, fontWeight: 'bold' },

  attendanceSummaryTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  barChart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', paddingTop: 4 },
  barColumn: { flex: 1, alignItems: 'center' },
  barCount: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  barTrack: { width: 18, height: 60, justifyContent: 'flex-end', marginBottom: 4 },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 8, fontWeight: '600' },

  ecdCard: {
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl,
    elevation: 4, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
    position: 'relative', overflow: 'hidden',
  },
  ecdTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  ecdLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  ecdBottomRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  ecdDate: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  ecdIcon: { position: 'absolute', right: -15, bottom: -15, transform: [{ rotate: '15deg' }] },

  progressSection: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: '600' },
  progressValue: { fontSize: 13, color: COLORS.primary, fontWeight: 'bold' },

  sectionTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: SPACING.md },

  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  recentTitle: { fontSize: 17, fontWeight: 'bold' },
  seeAll: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  logsList: { gap: 12 },
  logCard: {
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    elevation: 2, shadowColor: '#111827', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  logLeft: { flex: 1, marginRight: 8 },
  logDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  logDate: { fontSize: 14, fontWeight: 'bold' },
  logTypeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  logTypeText: { fontSize: 10, fontWeight: '700' },
  logTime: { fontSize: 12 },
  logRight: { alignItems: 'flex-end' },
  logHours: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: 'bold', textTransform: 'lowercase' },

  noLogsText: { fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
});

