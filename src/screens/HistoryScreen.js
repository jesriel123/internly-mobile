import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, StatusBar, TouchableOpacity } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0]);

  const fetchLogs = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = await getCachedTimeLogs(user.uid);
      setLogs(list.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    } catch (e) {
      console.error('Failed to fetch time logs:', e);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
  }, [fetchLogs]);

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

  // Calendar marking logic
  const markedDates = useMemo(() => {
    const marks = {};
    logs.forEach(log => {
      if (!log.date) return;
      
      const dots = [];
      if (log.status === 'pending') dots.push({ key: 'pending', color: '#F59E0B' });
      else if (log.status === 'approved') dots.push({ key: 'approved', color: '#10B981' });
      else if (!log.timeOut) dots.push({ key: 'ongoing', color: '#7C3AED' });

      marks[log.date] = {
        dots: dots,
        selected: log.date === selectedDate,
        selectedColor: '#7C3AED',
      };
    });

    if (!marks[selectedDate]) {
      marks[selectedDate] = { selected: true, selectedColor: '#7C3AED' };
    }

    return marks;
  }, [logs, selectedDate]);

  const monthEntriesCount = useMemo(() => {
    const monthPrefix = currentMonth.substring(0, 7);
    return logs.filter(l => l.date && l.date.startsWith(monthPrefix)).length;
  }, [logs, currentMonth]);

  const filteredLogs = useMemo(() => {
    const monthPrefix = currentMonth.substring(0, 7);
    return logs.filter(l => l.date && l.date.startsWith(monthPrefix));
  }, [logs, currentMonth]);

  const renderLogItem = ({ item }) => {
    const timeIn = item.timeIn ? (item.timeIn.toDate ? item.timeIn.toDate() : new Date(item.timeIn)) : null;
    const timeOut = item.timeOut ? (item.timeOut.toDate ? item.timeOut.toDate() : new Date(item.timeOut)) : null;
    
    const startStr = timeIn ? timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const endStr = timeOut ? timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing';
    const duration = item.hours != null ? `${parseFloat(item.hours).toFixed(2)}h` : '--';

    const statusColors = {
      approved: { bg: isDark ? '#064E3B' : '#DCFCE7', text: isDark ? '#10B981' : '#166534' },
      pending: { bg: isDark ? '#451A03' : '#FEF3C7', text: isDark ? '#F59E0B' : '#92400E' },
      rejected: { bg: isDark ? '#450A0A' : '#FEE2E2', text: isDark ? '#EF4444' : '#991B1B' },
      default: { bg: isDark ? '#2A2A2A' : '#F3F4F6', text: isDark ? '#9CA3AF' : '#6B7280' }
    };
    const s = statusColors[item.status] || statusColors.default;

    // Helper to determine type based on hours/status if logType is missing
    const getCalculatedType = (log) => {
      if (log.logType) return log.logType;
      if (!log.timeOut) return 'PRESENT'; // Ongoing
      const hours = parseFloat(log.hours || 0);
      if (hours === 0) return 'PRESENT';
      if (hours < 4) return 'HALF DAY';
      if (hours < 8) return 'EARLY OUT';
      return 'PRESENT';
    };

    const displayType = getCalculatedType(item);

    // Mapping for attendance types from the screenshot
    const getTypeStyles = (type) => {
      const normalType = (type || '').toUpperCase();
      switch(normalType) {
        // Based on the second screenshot (Web dashboard colors)
        case 'PRESENT': return { bg: isDark ? '#1E1B4B' : '#EEF2FF', text: '#6366F1' };
        case 'EARLY OUT': return { bg: isDark ? '#0C4A6E' : '#E0F2FE', text: '#0EA5E9' };
        case 'HALF DAY': return { bg: isDark ? '#422006' : '#FFFBEB', text: '#D97706' };
        case 'LATE': return { bg: isDark ? '#450A0A' : '#FEF2F2', text: '#EF4444' };
        default: return { bg: isDark ? '#2A2A2A' : '#F3F4F6', text: isDark ? '#9CA3AF' : '#6B7280' };
      }
    };

    const typeStyle = getTypeStyles(displayType);

    return (
      <View style={[styles.logCard, { backgroundColor: theme.surface, shadowColor: '#000' }]}>
        <View style={styles.logCardTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.logDate, { color: theme.text }]}>{item.date}</Text>
            {/* Attendance Type Badge (PRESENT, EARLY OUT, etc.) */}
            <View style={{ 
              paddingHorizontal: 8, 
              paddingVertical: 2, 
              borderRadius: 12, 
              backgroundColor: typeStyle.bg 
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: typeStyle.text }}>
                {displayType.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.logDuration, { color: theme.textSecondary }]}>{duration}</Text>
        </View>
        <View style={styles.logCardBottom}>
          <View style={styles.logTimeRow}>
            <Text style={[styles.logTime, { color: theme.primary }]}>{startStr}</Text>
            <Text style={{ color: theme.textSecondary, marginHorizontal: 6 }}>|</Text>
            <Text style={[styles.logTime, { color: item.timeOut ? theme.text : '#EF4444' }]}>{endStr}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusText, { color: s.text }]}>{(item.status || 'pending').toUpperCase()}</Text>
          </View>
        </View>
        {!item.timeOut && (
          <View style={[styles.ongoingIndicator, { backgroundColor: theme.primary }]}>
            <MaterialCommunityIcons name="clock-fast" size={14} color="#FFFFFF" />
          </View>
        )}
      </View>
    );
  };

  const monthName = new Date(currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#121212' : '#F3F4F6' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? '#121212' : '#F3F4F6'} />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Log History</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>{monthEntriesCount} entries this month</Text>
        </View>
      </View>

      <FlatList
        data={filteredLogs}
        renderItem={renderLogItem}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <>
            {/* Calendar Card */}
            <View style={[styles.calendarCard, { backgroundColor: theme.surface, shadowColor: isDark ? '#000' : '#000' }]}>
              <View style={styles.calendarHeader}>
                <Text style={[styles.calendarTitle, { color: theme.text }]}>{monthName}</Text>
                <View style={styles.calendarNav}>
                  <IconButton icon="chevron-left" size={16} iconColor={theme.text} onPress={() => {}} />
                  <IconButton icon="chevron-right" size={16} iconColor={theme.text} onPress={() => {}} />
                </View>
              </View>
              <Calendar
                key={isDark ? 'dark-calendar' : 'light-calendar'}
                current={currentMonth}
                onMonthChange={(month) => setCurrentMonth(month.dateString)}
                onDayPress={day => setSelectedDate(day.dateString)}
                markedDates={markedDates}
                markingType={'multi-dot'}
                theme={{
                  backgroundColor: theme.surface,
                  calendarBackground: theme.surface,
                  textSectionTitleColor: isDark ? '#9CA3AF' : '#9CA3AF',
                  selectedDayBackgroundColor: '#6366F1',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#6366F1',
                  dayTextColor: theme.text,
                  textDisabledColor: isDark ? '#4B5563' : '#D1D5DB',
                  dotColor: '#6366F1',
                  selectedDotColor: '#ffffff',
                  arrowColor: 'transparent',
                  monthTextColor: 'transparent', 
                  indicatorColor: '#6366F1',
                  textDayFontWeight: '500',
                  textMonthFontWeight: 'bold',
                  textDayHeaderFontWeight: '600',
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
                headerStyle={{ display: 'none' }}
              />
            </View>

            {/* Legend */}
            <View style={styles.legendRow}>
              <LegendItem color="#7C3AED" label="Ongoing" isDark={isDark} />
              <LegendItem color="#F59E0B" label="Pending" isDark={isDark} />
              <LegendItem color="#10B981" label="Approved" isDark={isDark} />
            </View>

            <Text style={[styles.sectionTitle, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>THIS MONTH</Text>
          </>
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No logs found for this period.</Text>
        }
      />
    </View>
  );
}

function LegendItem({ color, label, isDark }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  calendarTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  calendarNav: { flexDirection: 'row', gap: -8 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 24, paddingLeft: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#9CA3AF', marginBottom: 12, letterSpacing: 1 },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    position: 'relative',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  logCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  logDate: { fontSize: 16, fontWeight: '700' },
  logDuration: { fontSize: 16, fontWeight: '700' },
  logCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logTimeRow: { flexDirection: 'row', alignItems: 'center' },
  logTime: { fontSize: 14, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: '700' },
  ongoingIndicator: {
    position: 'absolute',
    bottom: -15,
    alignSelf: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#4B5563',
    borderWidth: 3,
    borderColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 30, fontStyle: 'italic' },
});

