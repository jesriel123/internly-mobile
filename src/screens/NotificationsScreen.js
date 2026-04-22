import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, StatusBar, SafeAreaView, ActivityIndicator, Platform } from 'react-native';
import { Text, Portal, Modal as PaperModal, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  fetchNotifications, 
  markNotificationAsRead, 
  getUnreadCount 
} from '../utils/realtimeNotifications';
import { Animated } from 'react-native'; // Added Animated import

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0)); // Added fadeAnim state

  useEffect(() => {
    loadNotifications();
    Animated.timing(fadeAnim, { // Added animation for fade effect
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const [notifs, count] = await Promise.all([
        fetchNotifications(user.uid),
        getUnreadCount(user.uid)
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (error) {
      console.error('[NotificationsScreen] Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const handleNotificationPress = async (notificationLog) => {
    setSelectedNotif(notificationLog);
    setModalVisible(true);
  };

  const markNotificationRead = async (notificationLog) => {
    if (!notificationLog || notificationLog.status !== 'sent') {
      return;
    }

    await markNotificationAsRead(notificationLog.id);

    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationLog.id
          ? { ...n, status: 'read' }
          : n
      )
    );
    if (selectedNotif?.id === notificationLog.id) {
      setSelectedNotif(prev => (prev ? { ...prev, status: 'read' } : prev));
    }
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markSelectedNotificationAsRead = async () => {
    await markNotificationRead(selectedNotif);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedNotif(null);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'clock_in':
        return 'clock-in';
      case 'clock_out':
        return 'clock-out';
      case 'approval':
        return 'check-circle';
      case 'rejected':
        return 'close-circle';
      default:
        return 'bell';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'clock_in':
        return '#10B981';
      case 'clock_out':
        return '#F59E0B';
      case 'approval':
        return '#7C3AED';
      case 'rejected':
        return '#EF4444';
      default:
        return COLORS.primary;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const bgColor = isDark ? '#121212' : '#F7F9FC';
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const textColor = isDark ? '#E2E8F0' : '#1A202C';
  const subtextColor = isDark ? '#94A3B8' : '#718096';
  const borderColor = isDark ? '#2D3748' : '#E2E8F0';

  const groupNotificationsByDate = (notifs) => {
    const groups = {
      Today: [],
      Yesterday: [],
      Earlier: []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;

    notifs.forEach(notif => {
      const date = new Date(notif.notification.created_at).getTime();
      if (date >= today) groups.Today.push(notif);
      else if (date >= yesterday) groups.Yesterday.push(notif);
      else groups.Earlier.push(notif);
    });

    return groups;
  };

  const groupedNotifs = groupNotificationsByDate(notifications);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <View>
          <Text style={[styles.headerTitle, { color: textColor }]}>Notifications</Text>
          <Text style={[styles.headerSubtitle, { color: subtextColor }]}>
            {unreadCount > 0 ? `${unreadCount} unread updates` : 'All caught up'}
          </Text>
        </View>
        <View
          style={[
            styles.headerBellWrap,
            {
              backgroundColor: isDark ? '#1B263B' : '#EEF2FF',
              borderColor: isDark ? '#2A3A58' : '#DCE6FF',
            },
          ]}
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color={COLORS.primary} />
          {unreadCount > 0 && (
            <View
              style={[
                styles.badge,
                unreadCount > 9 && styles.badgeWide,
                { borderColor: isDark ? '#121212' : '#FFFFFF' },
              ]}
            >
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {loading && notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={[styles.emptyText, { color: subtextColor }]}>Loading notifications...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <MaterialCommunityIcons name="bell-outline" size={36} color={COLORS.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No notifications yet</Text>
            <Text style={[styles.emptyText, { color: subtextColor }]}>New activity will show up here.</Text>
          </View>
        ) : (
          Object.keys(groupedNotifs).map(group => (
            groupedNotifs[group].length > 0 && (
              <View key={group} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: subtextColor }]}>{group}</Text>
                {groupedNotifs[group].map((notif) => {
                  const notification = notif.notification;
                  const isUnread = notif.status === 'sent';
                  const iconName = getNotificationIcon(notification.notification_type);
                  const iconColor = getNotificationColor(notification.notification_type);

                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[
                        styles.notificationCard,
                        {
                          backgroundColor: cardBg,
                          borderColor: isUnread ? COLORS.primary + '40' : borderColor,
                        },
                        isUnread && styles.unreadCard
                      ]}
                      onPress={() => handleNotificationPress(notif)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.iconContainer, { backgroundColor: iconColor + '15' }]}>
                        <MaterialCommunityIcons name={iconName} size={22} color={iconColor} />
                      </View>

                      <View style={styles.contentContainer}>
                        <View style={styles.titleRow}>
                          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                            {notification.title}
                          </Text>
                          {isUnread && <View style={styles.unreadDot} />}
                        </View>

                        <Text style={[styles.message, { color: subtextColor }]} numberOfLines={2}>
                          {notification.message}
                        </Text>

                        <View style={styles.footerRow}>
                          <MaterialCommunityIcons name="clock-outline" size={12} color={subtextColor} style={{ marginRight: 4 }} />
                          <Text style={[styles.time, { color: subtextColor }]}>
                            {formatTime(notification.created_at)}
                          </Text>
                        </View>

                        {isUnread && (
                          <TouchableOpacity
                            onPress={() => markNotificationRead(notif)}
                            activeOpacity={0.8}
                            style={styles.inlineMarkReadBtn}
                          >
                            <MaterialCommunityIcons name="check-circle-outline" size={16} color={COLORS.primary} />
                            <Text style={styles.inlineMarkReadText}>Mark as Read</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end', marginLeft: 10 }}>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={subtextColor + '60'} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          ))
        )}
      </ScrollView>

      {/* Notification Detail Modal */}
      <Portal>
        <PaperModal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          {selectedNotif && (
            <View>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconWrap, { backgroundColor: getNotificationColor(selectedNotif.notification.notification_type) + '20' }]}>
                  <MaterialCommunityIcons 
                    name={getNotificationIcon(selectedNotif.notification.notification_type)} 
                    size={32} 
                    color={getNotificationColor(selectedNotif.notification.notification_type)} 
                  />
                </View>
                <IconButton
                  icon="close"
                  size={24}
                  onPress={closeModal}
                  style={styles.closeButton}
                  iconColor={textColor}
                />
              </View>

              <Text style={[styles.modalTitle, { color: textColor }]}>
                {selectedNotif.notification.title}
              </Text>
              
              <View style={styles.modalMeta}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={subtextColor} />
                <Text style={[styles.modalTime, { color: subtextColor }]}>
                  {new Date(selectedNotif.notification.created_at).toLocaleString()}
                </Text>
              </View>

              <ScrollView style={styles.modalMessageScroll} showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalMessage, { color: textColor }]}>
                  {selectedNotif.notification.message}
                </Text>
              </ScrollView>

              {selectedNotif.status === 'sent' && (
                <Button
                  mode="outlined"
                  onPress={markSelectedNotificationAsRead}
                  style={[styles.modalSecondaryBtn, { borderColor: COLORS.primary }]}
                  labelStyle={[styles.modalSecondaryBtnLabel, { color: COLORS.primary }]}
                >
                  Mark as Read
                </Button>
              )}

              <Button 
                mode="contained" 
                onPress={closeModal}
                style={[styles.modalActionBtn, { backgroundColor: COLORS.primary }]}
                labelStyle={styles.modalActionBtnLabel}
              >
                Close
              </Button>
            </View>
          )}
        </PaperModal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 14,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerBellWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 99,
    paddingHorizontal: 6,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: -6,
    right: -8,
    borderWidth: 1.5,
  },
  badgeWide: {
    minWidth: 28,
    paddingHorizontal: 7,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(123, 104, 238, 0.12)',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  // Modal Styles
  modalContainer: {
    margin: 20,
    padding: 24,
    paddingTop: 28,
    borderRadius: 32,
    elevation: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    margin: -10,
    opacity: 0.6,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
    lineHeight: 30,
  },
  modalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  modalTime: {
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modalMessageScroll: {
    maxHeight: 250,
    marginBottom: 36,
  },
  modalMessage: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.9,
  },
  modalActionBtn: {
    borderRadius: 100,
    paddingVertical: 8,
  },
  modalSecondaryBtn: {
    borderRadius: 100,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1.5,
  },
  modalSecondaryBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'none',
  },
  modalActionBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'none',
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineMarkReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 104, 238, 0.12)',
  },
  inlineMarkReadText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  time: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
