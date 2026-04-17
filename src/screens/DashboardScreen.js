import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, StatusBar, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import { getCachedTimeLogs, invalidateTimeLogsCache } from '../utils/timeLogsCache';

const { width } = Dimensions.get('window');

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

function classifyLog(hours, dailyMax) {
  if (hours == null) return 'absent';
  const h = Number(hours);
  if (h > dailyMax) return 'overtime';
  if (h >= dailyMax) return 'present';
  if (h >= dailyMax / 2) return 'earlyOut';
  return 'halfDay';
}

function computeAttendance(logs, startDate, dailyMax) {
  const logMap = {};
  logs.forEach(l => { logMap[l.date] = l; });

  let present = 0, absent = 0, halfDay = 0, earlyOut = 0, overtime = 0;

  if (startDate) {
    const start = new Date(startDate.includes('T') ? startDate : startDate + 'T00:00:00');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
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

export default function DashboardScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [ojtData, setOjtData] = useState({ renderedHours: 0, pendingHours: 0, recentLogs: [], attendance: { present: 0, absent: 0, halfDay: 0, earlyOut: 0, overtime: 0 } });
  const [loading, setLoading] = useState(true);
  const lastFetchRef = React.useRef(0);

  useEffect(() => {
    // Keep greeting/date in sync with device time while the screen stays open.
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

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
      setNow(new Date());
      const now = Date.now();
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

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || 'Intern').split(' ')[0];
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const userInitial = firstName ? firstName.charAt(0).toUpperCase() : 'I';

  const { present, absent, halfDay, earlyOut, overtime } = ojtData.attendance;

  const mainBg = isDark ? '#121212' : '#F5F5F5';
  
  return (
    <View style={[styles.container, { backgroundColor: mainBg, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={mainBg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* HERO CARD */}
        <LinearGradient
          colors={['#2A2770', '#41228B']}
          style={styles.heroCard}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          {/* Top Row: Pill and Progress */}
          <View style={styles.heroTopRow}>
            <View style={styles.appPill}>
              <MaterialCommunityIcons name="help-circle-outline" size={14} color="#FFFFFF" />
              <Text style={styles.appPillText}>Internly Dashboard</Text>
            </View>
            <Text style={styles.heroPercent}>{progress.toFixed(0)}%</Text>
          </View>

          {/* Profile Name & Avatar */}
          <View style={styles.profileSection}>
            <View style={styles.avatarCircle}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{userInitial}</Text>
              )}
            </View>
            <View style={styles.profileTextContainer}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.name}>{firstName}</Text>
              <View style={styles.dateRow}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.date}>{todayStr}</Text>
              </View>
            </View>
          </View>

          {/* Pending Text */}
          <Text style={styles.pendingText}>{ojtData.pendingHours.toFixed(1)}h pending approval.</Text>
          
          {/* 3 Stats Boxes */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxVal}>{rendered.toFixed(1)}h</Text>
              <Text style={styles.statBoxLabel}>RENDERED</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxVal}>{ojtData.pendingHours.toFixed(1)}h</Text>
              <Text style={styles.statBoxLabel}>PENDING</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxVal}>{remaining.toFixed(1)}h</Text>
              <Text style={styles.statBoxLabel}>LEFT</Text>
            </View>
          </View>

          {/* Buttons Row */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('TimeLog')}>
              <MaterialCommunityIcons name="clock-time-four-outline" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Log Time</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('History')}>
              <MaterialCommunityIcons name="history" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>View History</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* MIDDLE SECTION - 2 COLUMNS */}
        <View style={styles.middleRow}>
          {/* Progress Card (Left) */}
          <View style={[styles.halfCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
            <View style={styles.circleContainer}>
              <View style={styles.outerCircle}>
                 <Text style={styles.circleValue}>{progress.toFixed(0)}%</Text>
                 <Text style={styles.circleLabel}>done</Text>
              </View>
            </View>

            <View style={styles.progressDataList}>
               <View style={styles.progressDataItem}>
                  <Text style={styles.pdLabel}>Required</Text>
                  <Text style={[styles.pdVal, { color: isDark ? '#FFF' : '#000' }]}>{required}h</Text>
               </View>
               <View style={styles.progressDataItem}>
                  <Text style={styles.pdLabel}>Rendered</Text>
                  <Text style={[styles.pdVal, { color: '#8A74F9' }]}>{rendered.toFixed(1)}h</Text>
               </View>
               <View style={styles.progressDataItem}>
                  <Text style={styles.pdLabel}>Remaining</Text>
                  <Text style={[styles.pdVal, { color: '#FF5252' }]}>{remaining.toFixed(1)}h</Text>
               </View>
            </View>
          </View>

          {/* Attendance Card (Right) */}
          <View style={[styles.halfCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
            <Text style={[styles.attTitle, { color: isDark ? '#FFF' : '#000' }]}>Attendance{'\n'}Summary</Text>
            
            <View style={styles.attNumbersRow}>
               <Text style={[styles.attNum, { color: '#8A74F9' }]}>{present}</Text>
               <Text style={[styles.attNum, { color: '#FF5252' }]}>{absent}</Text>
               <Text style={[styles.attNum, { color: '#FFCA28' }]}>{halfDay}</Text>
               <Text style={[styles.attNum, { color: '#448AFF' }]}>{earlyOut}</Text>
               <Text style={[styles.attNum, { color: '#4CAF50' }]}>{overtime}</Text>
            </View>

            <View style={styles.attLinesRow}>
               <View style={[styles.attLine, { backgroundColor: '#8A74F9' }]} />
               <View style={[styles.attLine, { backgroundColor: '#FF5252' }]} />
               <View style={[styles.attLine, { backgroundColor: '#FFCA28' }]} />
               <View style={[styles.attLine, { backgroundColor: '#448AFF' }]} />
               <View style={[styles.attLine, { backgroundColor: '#4CAF50' }]} />
            </View>

            <View style={styles.attLabelsRow}>
               <Text style={styles.attSubLabel}>Pres</Text>
               <Text style={styles.attSubLabel}>Abs</Text>
               <Text style={styles.attSubLabel}>Half</Text>
               <Text style={styles.attSubLabel}>Early</Text>
               <Text style={styles.attSubLabel}>OT</Text>
            </View>
          </View>
        </View>

        {/* BOTTOM CARD: Estimated Completion */}
        <LinearGradient
          colors={['#8D7AFB', '#A78BFA']}
          style={styles.bottomCard}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <MaterialCommunityIcons name="school-outline" size={100} color="rgba(255,255,255,0.15)" style={styles.schoolBgIcon} />
          <View style={styles.bottomCardContent}>
             <View style={styles.bottomIconRow}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={16} color="#FFFFFF" />
                <Text style={styles.bottomTitle}>Estimated Completion</Text>
             </View>
             <Text style={styles.bottomDate}>{loading ? 'Calculating...' : ecd}</Text>
          </View>
        </LinearGradient>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  appPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  appPillText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  heroPercent: { color: '#FFF', fontSize: 28, fontWeight: '800' },

  profileSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  avatarText: { color: '#FFF', fontSize: 24, fontWeight: '700' },
  profileTextContainer: { flex: 1 },
  greeting: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 2 },
  name: { color: '#FFF', fontSize: 26, fontWeight: 'bold', marginBottom: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  pendingText: { color: '#FFF', fontSize: 13, marginBottom: 16 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statBoxVal: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  statBoxLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },

  actionButtonsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  actionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },

  middleRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  halfCard: {
    flex: 1,
    borderRadius: 24,
    padding: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  
  circleContainer: {
    marginBottom: 20,
    alignItems: 'center', justifyContent: 'center'
  },
  outerCircle: {
    width: 90, height: 90,
    borderRadius: 45,
    borderWidth: 8,
    borderColor: '#3A2D7D',
    borderTopColor: '#6B4EFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleValue: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  circleLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  progressDataList: { width: '100%', alignItems: 'center' },
  progressDataItem: { alignItems: 'center', marginBottom: 10 },
  pdLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 2 },
  pdVal: { fontSize: 16, fontWeight: 'bold' },

  attTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  attNumbersRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4, marginBottom: 12 },
  attNum: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', width: 24 },
  attLinesRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4, marginBottom: 8 },
  attLine: { height: 4, width: 14, borderRadius: 2 },
  attLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 0 },
  attSubLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, width: 30, textAlign: 'center' },

  bottomCard: {
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  schoolBgIcon: {
    position: 'absolute',
    right: -10,
    bottom: -15,
    transform: [{ rotate: '-15deg' }]
  },
  bottomCardContent: { zIndex: 1 },
  bottomIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  bottomTitle: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  bottomDate: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
});
