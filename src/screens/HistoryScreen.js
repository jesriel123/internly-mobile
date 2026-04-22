import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, StatusBar, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedTimeLogs, invalidateTimeLogsCache } from '../utils/timeLogsCache';
import { supabase } from '../../supabaseConfig';

function addMonthsToDateKey(dateKey, monthDelta) {
  const base = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().split('T')[0];
  }

  base.setMonth(base.getMonth() + monthDelta);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0]);
  const [moveTargetLog, setMoveTargetLog] = useState(null);
  const [movingLogId, setMovingLogId] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [notice, setNotice] = useState({
    visible: false,
    title: '',
    message: '',
    icon: 'information-outline',
  });

  const showNotice = useCallback((title, message, icon = 'information-outline') => {
    setNotice({ visible: true, title, message, icon });
  }, []);

  const closeNotice = useCallback(() => {
    setNotice(prev => ({ ...prev, visible: false }));
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = await getCachedTimeLogs(user.uid);
      const normalized = (list || [])
        .map(log => ({ ...log, date: toDateKey(log.date) }))
        .filter(log => !!log.date);
      setLogs(normalized.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
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

  useEffect(() => {
    const today = todayKey();
    if (selectedDate > today) {
      setSelectedDate(today);
    }
    if (currentMonth > today) {
      setCurrentMonth(today);
    }
  }, [selectedDate, currentMonth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user?.uid) invalidateTimeLogsCache(user.uid);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs, user?.uid]);

  // Calendar marking logic
  const markedDates = useMemo(() => {
    const marks = {};
    const today = todayKey();

    logs.forEach(log => {
      if (!log.date) return;
      if (log.date > today) return;
      
      const dots = [];
      if (log.status === 'approved') {
        dots.push({ key: 'approved', color: '#10B981' });
      } else if (log.status === 'rejected') {
        dots.push({ key: 'rejected', color: '#EF4444' });
      } else if (log.status === 'pending') {
        dots.push({ key: 'pending', color: '#F59E0B' });
      } else if (!log.timeOut) {
        dots.push({ key: 'ongoing', color: '#7C3AED' });
      }

      if (log.date < today && log.status !== 'approved') {
        dots.push({ key: 'overdue', color: '#F97316' });
      }

      marks[log.date] = {
        dots: dots,
        selected: log.date === selectedDate,
        selectedColor: '#7C3AED',
        selectedTextColor: '#FFFFFF',
        textColor: log.date < today ? (isDark ? '#9CA3AF' : '#6B7280') : theme.text,
      };
    });

    if (!marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: '#7C3AED',
        selectedTextColor: '#FFFFFF',
      };
    }

    return marks;
  }, [logs, selectedDate, isDark, theme.text]);

  const monthEntriesCount = useMemo(() => {
    const monthPrefix = currentMonth.substring(0, 7);
    const today = todayKey();
    return logs.filter(l => l.date && l.date.startsWith(monthPrefix) && l.date <= today).length;
  }, [logs, currentMonth]);

  const filteredLogs = useMemo(() => {
    const today = todayKey();
    return logs.filter(l => l.date === selectedDate && l.date <= today);
  }, [logs, selectedDate]);

  const isPastDate = useCallback((dateKey) => {
    return toDateKey(dateKey) < todayKey();
  }, []);

  const isMoveLocked = useCallback((log) => {
    if (!log) return true;
    if (log.status === 'approved') return true;
    if (isPastDate(log.date)) return true;
    return false;
  }, [isPastDate]);

  const startMoveMode = useCallback((log) => {
    if (!log) return;

    if (log.status === 'approved') {
      showNotice('Move Not Allowed', 'Approved logs cannot be moved.', 'lock-outline');
      return;
    }

    if (isPastDate(log.date)) {
      showNotice('Move Not Allowed', 'Past-date logs cannot be moved.', 'lock-outline');
      return;
    }

    setMoveTargetLog(log);
    showNotice(
      'Move Mode Enabled',
      'Tap a new date on the calendar to move this log.',
      'cursor-move'
    );
  }, [isPastDate, showNotice]);

  const cancelMoveMode = useCallback(() => {
    setMoveTargetLog(null);
  }, []);

  const moveLogToDate = useCallback(async (targetDate) => {
    if (!moveTargetLog?.id || !targetDate) return;

    if (targetDate === moveTargetLog.date) {
      cancelMoveMode();
      return;
    }

    const today = todayKey();

    if (targetDate < today) {
      showNotice('Invalid Date', 'You cannot move a log to a past date.', 'calendar-remove');
      return;
    }

    if (targetDate > today) {
      showNotice('Invalid Date', 'Future schedules are not allowed yet.', 'calendar-clock');
      return;
    }

    setMovingLogId(moveTargetLog.id);
    try {
      const { error } = await supabase
        .from('time_logs')
        .update({ date: targetDate })
        .eq('id', moveTargetLog.id)
        .eq('user_id', user.uid);

      if (error) throw error;

      invalidateTimeLogsCache(user.uid);
      await fetchLogs();
      setSelectedDate(targetDate);
      setCurrentMonth(targetDate);
      setMoveTargetLog(null);

      showNotice('Success', `Log moved to ${targetDate}.`, 'check-circle-outline');
    } catch (error) {
      showNotice('Move Failed', error?.message || 'Unable to move log date right now.', 'alert-circle-outline');
    } finally {
      setMovingLogId(null);
    }
  }, [moveTargetLog, user?.uid, fetchLogs, cancelMoveMode, showNotice]);

  const goToPreviousMonth = () => {
    const next = addMonthsToDateKey(currentMonth, -1);
    setCurrentMonth(next);
    setSelectedDate(next);
  };

  const goToNextMonth = () => {
    const today = todayKey();
    const next = addMonthsToDateKey(currentMonth, 1);
    if (next > today) {
      showNotice('Future Month Locked', 'You cannot open schedules for future months yet.', 'lock-outline');
      return;
    }
    setCurrentMonth(next);
    setSelectedDate(next);
  };

  const formatTime = (value) => {
    if (!value) return '--:--';
    const d = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const buildHistoryReportHtml = () => {
    const today = todayKey();
    const reportLogs = [...logs]
      .filter(l => l.date && l.date <= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const approvedHours = reportLogs.reduce((sum, l) => {
      if (l.status === 'approved' && l.hours != null) return sum + Number(l.hours || 0);
      return sum;
    }, 0);
    const pendingHours = reportLogs.reduce((sum, l) => {
      if (l.status === 'pending' && l.hours != null) return sum + Number(l.hours || 0);
      return sum;
    }, 0);

    const requiredHours = Number(user?.setup?.requiredHours || 486);
    const remainingHours = Math.max(0, requiredHours - approvedHours);

    const rows = reportLogs
      .map((log, index) => {
        const date = log.date || '--';
        const timeIn = formatTime(log.timeIn);
        const timeOut = log.timeOut ? formatTime(log.timeOut) : 'Ongoing';
        const hours = log.hours != null ? Number(log.hours).toFixed(2) : '--';
        const status = String(log.status || 'pending').toUpperCase();
        const type = String(log.logType || '').toUpperCase() || '--';
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${date}</td>
            <td>${timeIn}</td>
            <td>${timeOut}</td>
            <td>${hours}</td>
            <td>${type}</td>
            <td>${status}</td>
          </tr>`;
      })
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; color: #111827; }
            h1 { margin: 0 0 4px 0; font-size: 22px; }
            .sub { margin: 0 0 14px 0; color: #4B5563; font-size: 12px; }
            .meta { margin: 0 0 12px 0; font-size: 12px; color: #374151; }
            .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 14px 0; }
            .card { border: 1px solid #E5E7EB; border-radius: 8px; padding: 8px; }
            .label { font-size: 11px; color: #6B7280; }
            .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #E5E7EB; padding: 8px; font-size: 11px; text-align: left; }
            th { background: #F3F4F6; font-weight: 700; }
            .sign { margin-top: 28px; display: flex; justify-content: space-between; gap: 20px; }
            .line { border-top: 1px solid #9CA3AF; width: 220px; padding-top: 6px; font-size: 11px; color: #6B7280; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Internly OJT History Report</h1>
          <p class="sub">Printable full history report</p>
          <p class="meta"><strong>Name:</strong> ${user?.name || user?.email || 'Student'}<br/>
          <strong>Company:</strong> ${user?.company || 'N/A'}<br/>
          <strong>Generated:</strong> ${new Date().toLocaleString()}</p>

          <div class="stats">
            <div class="card"><div class="label">Approved Hours</div><div class="value">${approvedHours.toFixed(2)}h</div></div>
            <div class="card"><div class="label">Pending Hours</div><div class="value">${pendingHours.toFixed(2)}h</div></div>
            <div class="card"><div class="label">Required Hours</div><div class="value">${requiredHours.toFixed(2)}h</div></div>
            <div class="card"><div class="label">Remaining Hours</div><div class="value">${remainingHours.toFixed(2)}h</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Hours</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7">No history records found.</td></tr>'}
            </tbody>
          </table>

          <div class="sign">
            <div class="line">Student Signature</div>
            <div class="line">Supervisor / Coordinator Signature</div>
          </div>
        </body>
      </html>
    `;
  };

  const exportHistoryPdf = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setExportingPdf(true);
      const html = buildHistoryReportHtml();
      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showNotice('PDF Created', `PDF was generated at: ${uri}`, 'file-pdf-box');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Export OJT History PDF',
        UTI: 'com.adobe.pdf',
      });
      showNotice('Success', 'Your history PDF is ready to print/share.', 'check-circle-outline');
    } catch (error) {
      showNotice('Export Failed', error?.message || 'Unable to export PDF right now.', 'alert-circle-outline');
    } finally {
      setExportingPdf(false);
    }
  }, [user?.uid, logs, showNotice]);

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
      <TouchableOpacity
        activeOpacity={0.92}
        disabled={movingLogId === item.id}
        onLongPress={() => startMoveMode(item)}
      >
      <View
        style={[
          styles.logCard,
          { backgroundColor: theme.surface, shadowColor: '#000' },
          moveTargetLog?.id === item.id && styles.moveTargetCard,
          isMoveLocked(item) && styles.lockedCard,
        ]}
      >
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
        {isMoveLocked(item) && (
          <View style={styles.lockIconWrap}>
            <MaterialCommunityIcons name="lock" size={14} color="#6B7280" />
          </View>
        )}
      </View>
      </TouchableOpacity>
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
        <TouchableOpacity
          style={[styles.exportBtn, exportingPdf && styles.exportBtnDisabled]}
          onPress={exportHistoryPdf}
          disabled={exportingPdf}
        >
          <MaterialCommunityIcons name="file-pdf-box" size={16} color="#FFFFFF" />
          <Text style={styles.exportBtnText}>{exportingPdf ? 'Exporting...' : 'Export PDF'}</Text>
        </TouchableOpacity>
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
                  <IconButton icon="chevron-left" size={16} iconColor={theme.text} onPress={goToPreviousMonth} />
                  <IconButton icon="chevron-right" size={16} iconColor={theme.text} onPress={goToNextMonth} />
                </View>
              </View>
              <Calendar
                key={isDark ? 'dark-calendar' : 'light-calendar'}
                current={currentMonth}
                onMonthChange={(month) => {
                  const today = todayKey();
                  if (month.dateString > today) {
                    setCurrentMonth(today);
                    return;
                  }
                  setCurrentMonth(month.dateString);
                }}
                onDayPress={day => {
                  const today = todayKey();
                  if (day.dateString > today) {
                    showNotice('Future Date Locked', 'You cannot select a future date yet.', 'lock-outline');
                    return;
                  }

                  if (moveTargetLog) {
                    moveLogToDate(day.dateString);
                  } else {
                    setSelectedDate(day.dateString);
                    setCurrentMonth(day.dateString);
                  }
                }}
                markedDates={markedDates}
                markingType={'multi-dot'}
                enableSwipeMonths
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
              <LegendItem color="#F97316" label="Overdue" isDark={isDark} />
            </View>

            {moveTargetLog && (
              <View style={[styles.moveBanner, { backgroundColor: isDark ? '#2A1C47' : '#EEF2FF' }]}>
                <MaterialCommunityIcons name="cursor-move" size={16} color="#6366F1" />
                <Text style={[styles.moveBannerText, { color: isDark ? '#C4B5FD' : '#4338CA' }]}>
                  Moving log from {moveTargetLog.date}. Tap a new date.
                </Text>
                <TouchableOpacity onPress={cancelMoveMode}>
                  <Text style={styles.cancelMoveText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.moveHint, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
              Long-press a log card to move it. Approved and past-date logs are locked.
            </Text>

            <Text style={[styles.sectionTitle, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>SELECTED DATE: {selectedDate}</Text>
          </>
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No logs found on this date.</Text>
        }
      />

      <Modal visible={notice.visible} transparent animationType="fade" onRequestClose={closeNotice}>
        <Pressable style={styles.noticeBackdrop} onPress={closeNotice}>
          <Pressable style={[styles.noticeCard, { backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF' }]} onPress={() => {}}>
            <View style={styles.noticeHeaderRow}>
              <View style={[styles.noticeIconWrap, { backgroundColor: isDark ? '#2C2C2C' : '#EEF2FF' }]}>
                <MaterialCommunityIcons name={notice.icon} size={20} color="#6366F1" />
              </View>
              <Text style={[styles.noticeTitle, { color: theme.text }]}>{notice.title}</Text>
            </View>
            <Text style={[styles.noticeMessage, { color: theme.textSecondary }]}>{notice.message}</Text>
            <TouchableOpacity style={styles.noticeButton} onPress={closeNotice}>
              <Text style={styles.noticeButtonText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  exportBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportBtnDisabled: {
    opacity: 0.75,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
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
  moveBanner: {
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moveBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },
  cancelMoveText: { color: '#6366F1', fontWeight: '800', fontSize: 12 },
  moveHint: { fontSize: 12, marginBottom: 10, fontWeight: '600' },
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
  moveTargetCard: {
    borderWidth: 1.5,
    borderColor: '#6366F1',
  },
  lockedCard: {
    opacity: 0.9,
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
  lockIconWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
  },
  noticeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  noticeCard: {
    borderRadius: 20,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  noticeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: {
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
  },
  noticeMessage: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  noticeButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  noticeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 30, fontStyle: 'italic' },
});

