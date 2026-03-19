import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedTimeLogs, invalidateTimeLogsCache } from '../utils/timeLogsCache';

export default function HistoryScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dailyMax = user?.setup?.dailyMaxHours || 8;

  const fetchLogs = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = (await getCachedTimeLogs(user.uid))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setLogs(list);
    } catch (e) {
      console.error('Failed to fetch time logs:', e);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
  }, [fetchLogs]);

  // Re-fetch on focus, using cache (TTL: 5 min) to avoid unnecessary reads
  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user?.uid) invalidateTimeLogsCache(user.uid);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs, user?.uid]);

  const LOG_TYPE_CONFIG = {
    present:  { label: 'Present',   color: '#7C3AED', bg: '#EDE9FE' },
    overtime: { label: 'Overtime',  color: '#10B981', bg: '#D1FAE5' },
    earlyOut: { label: 'Early Out', color: '#3B82F6', bg: '#DBEAFE' },
    halfDay:  { label: 'Half Day',  color: '#F59E0B', bg: '#FEF3C7' },
  };

  function autoClassify(hours, max) {
    if (hours == null) return null;
    const h = Number(hours);
    if (h > max) return 'overtime';
    if (h >= max) return 'present';
    if (h >= max / 2) return 'earlyOut';
    return 'halfDay';
  }

  const renderItem = ({ item }) => {
    const startStr = item.timeIn ? (item.timeIn.toDate ? item.timeIn.toDate() : new Date(item.timeIn)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
    const endStr = item.timeOut ? (item.timeOut.toDate ? item.timeOut.toDate() : new Date(item.timeOut)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ongoing';
    
    const hrs = item.hours != null ? parseFloat(item.hours) : 0;
    const hrsStr = item.hours != null ? `${hrs.toFixed(2).replace(/\.00$/, '')}h` : '--';
    
    // Status text & style
    const status = item.status || 'pending';
    const isApproved = status === 'approved';
    const isRejected = status === 'rejected';

    // Log type badge (only show when approved)
    const detectedType = item.logType || (isApproved ? autoClassify(item.hours, dailyMax) : null);
    const typeConfig = detectedType ? LOG_TYPE_CONFIG[detectedType] : null;

    // Calculate progress width for the bottom gradient bar
    // Math.min to cap at 100%
    const progressPct = Math.min(100, (hrs / dailyMax) * 100);

    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.cardTop}>
          <Text style={[styles.dateText, { color: theme.text }]}>{item.date}</Text>
          <Text style={[styles.hoursText, { color: theme.text }]}>{hrsStr}</Text>
        </View>
        
        <View style={styles.cardMiddle}>
          <Text style={styles.timeText}>
            <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>In: </Text>
            <Text style={styles.timeValBlue}>{startStr}</Text>
            <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>  |  Out: </Text>
            <Text style={styles.timeValRed}>{endStr}</Text>
          </Text>

          <View style={styles.badgesRow}>
            {typeConfig && (
              <View style={[styles.statusBadge, { backgroundColor: typeConfig.bg, marginRight: 4 }]}>
                <Text style={[styles.statusText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
              </View>
            )}
            <View style={[styles.statusBadge, isApproved ? styles.badgeApproved : isRejected ? styles.badgeRejected : styles.badgePending]}>
              <Text style={[styles.statusText, isApproved ? styles.statusTextApproved : isRejected ? styles.statusTextRejected : styles.statusTextPending]}>
                {status}
              </Text>
            </View>
          </View>
        </View>

        {/* Gradient Line Progress */}
        <View style={[styles.progressBarContainer, { backgroundColor: theme.accent }]}>
          <LinearGradient 
            colors={COLORS.gradient} 
            start={{ x: 0, y: 0 }} 
            end={{ x: 1, y: 0 }} 
            style={[styles.progressBarGlow, { width: `${progressPct}%` }]} 
          />
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Log History</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{loading ? 'Loading...' : `${logs.length} entries`}</Text>
      </View>

      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        ListEmptyComponent={
          !loading && <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No log history found.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 60,
    paddingBottom: SPACING.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  hoursText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardMiddle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  timeText: {
    fontSize: 13,
  },
  timeLabel: {
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  timeValBlue: {
    color: COLORS.primary, // representing the light blue/cyan in the image using primary
    fontWeight: 'bold',
  },
  timeValRed: {
    color: '#FF5252', // representing the red/pink in the image
    fontWeight: 'bold',
  },
  
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'lowercase',
  },
  badgeApproved: { backgroundColor: '#E8F5E9' },
  statusTextApproved: { color: '#4CAF50' },
  badgePending: { backgroundColor: '#FFF3E0' },
  statusTextPending: { color: '#FF9800' },
  badgeRejected: { backgroundColor: '#FFEBEE' },
  statusTextRejected: { color: '#F44336' },

  progressBarContainer: {
    height: 4,
    backgroundColor: COLORS.accent, // A light background track for the bar
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarGlow: {
    height: '100%',
    borderRadius: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 40,
    fontStyle: 'italic',
  }
});
