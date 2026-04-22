import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { getCachedTimeLogs } from '../utils/timeLogsCache';
import {
  cacheActiveDeviceTokens,
  deactivateDeviceTokenById,
  deactivateOtherDeviceTokens,
  getActiveDeviceTokens,
  getCachedActiveDeviceTokens,
  ensureCurrentDeviceInCache,
  getStoredDeviceToken,
} from '../utils/notificationService';
import { supabase } from '../../supabaseConfig';

function computeEndDate(startDateStr, requiredHours, dailyMaxHours) {
  if (!startDateStr) return null;
  const workdaysNeeded = Math.ceil(requiredHours / dailyMaxHours);
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) return null;
  let count = 0;
  while (count < workdaysNeeded) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, logout, updateProfile, uploadProfilePhoto, refreshProfile } = useAuth();
  const [renderedHours, setRenderedHours] = useState(0);
  const [editVisible, setEditVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [devicesVisible, setDevicesVisible] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [currentToken, setCurrentToken] = useState(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [activeDeviceActionId, setActiveDeviceActionId] = useState(null);
  const isSubmitting = useRef(false);

  const formatDeviceUpdatedAt = (dateString) => {
    if (!dateString) return 'Unknown activity';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Unknown activity';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const loadDevices = useCallback(async ({ silent = false } = {}) => {
    if (!user?.uid) return;
    if (!silent) {
      setDevicesLoading(true);
    }

    let cachedCount = 0;

    try {
      const [storedToken, cachedDevices] = await Promise.all([
        getStoredDeviceToken(),
        getCachedActiveDeviceTokens(user.uid),
      ]);

      cachedCount = cachedDevices?.length || 0;

      setCurrentToken(storedToken || null);

      if (cachedDevices?.length) {
        setDevices(cachedDevices);
      }

      const activeDevices = await getActiveDeviceTokens(user.uid);
      if ((activeDevices || []).length > 0) {
        setDevices(activeDevices || []);
        await cacheActiveDeviceTokens(user.uid, activeDevices || []);
      } else {
        const fallbackDevices = await ensureCurrentDeviceInCache(user.uid);
        setDevices(fallbackDevices || []);
      }
    } catch (error) {
      console.error('[ProfileScreen] Failed to load devices:', error);
      if (!silent && cachedCount === 0) {
        Alert.alert('Offline mode', 'Showing last saved devices. Connect to the internet to refresh.');
      }
    } finally {
      setDevicesLoading(false);
    }
  }, [user?.uid]);

  const openEdit = () => {
    setEditForm({
      name: user?.name || '',
      studentId: user?.studentId || '',
      program: user?.program || '',
      yearLevel: user?.yearLevel || '',
      section: user?.section || '',
    });
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { Alert.alert('Error', 'Name is required'); return; }
    setSaving(true);
    try {
      await updateProfile({
        name: editForm.name.trim(),
        studentId: editForm.studentId.trim(),
        program: editForm.program.trim(),
        yearLevel: editForm.yearLevel.trim(),
        section: editForm.section.trim(),
      });
      setEditVisible(false);
      Alert.alert('Success', 'Profile updated!');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchHours = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const logs = await getCachedTimeLogs(user.uid);
      let rendered = 0;
      logs.forEach(data => {
        if (data.status === 'approved' && data.hours != null) {
          rendered += Number(data.hours);
        }
      });
      setRenderedHours(rendered);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    fetchHours();
  }, [fetchHours]);

  useFocusEffect(
    useCallback(() => {
      refreshProfile({ silent: true }).catch(() => {});
      if (user?.uid) {
        loadDevices({ silent: true }).catch(() => {});
      }
    }, [refreshProfile, user?.uid, loadDevices])
  );

  useEffect(() => {
    if (!user?.uid) return;
    loadDevices({ silent: true }).catch(() => {});
  }, [user?.uid, loadDevices]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const channel = supabase
      .channel(`profile-device-tokens-${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_tokens',
          filter: `user_id=eq.${user.uid}`,
        },
        () => {
          loadDevices({ silent: true }).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.uid, loadDevices]);

  const handleLogout = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    try {
      await logout();
    } catch (error) {
      console.error(error);
    } finally {
      isSubmitting.current = false;
    }
  };

  const handleEditProfile = () => { openEdit(); };

  const handleOpenDevices = async () => {
    setDevicesVisible(true);
    await loadDevices();
  };

  const handleLogoutOtherDevices = async () => {
    if (!user?.uid) return;

    Alert.alert(
      'Log out other devices?',
      'This will sign out your account from all other devices except this current phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out others',
          style: 'destructive',
          onPress: async () => {
            try {
              setSigningOutOthers(true);
              const { error } = await supabase.auth.signOut({ scope: 'others' });
              if (error) throw error;
              await deactivateOtherDeviceTokens(user.uid);
              await loadDevices();
              Alert.alert('Success', 'Other devices were logged out.');
            } catch (error) {
              console.error('[ProfileScreen] Failed to sign out others:', error);
              Alert.alert('Error', error?.message || 'Could not log out other devices.');
            } finally {
              setSigningOutOthers(false);
            }
          },
        },
      ]
    );
  };

  const handleDeactivateSingleDevice = async (device) => {
    if (!user?.uid || !device?.id) return;

    const isCurrent = currentToken && device.token === currentToken;
    if (isCurrent) {
      Alert.alert('Current device', 'Use normal Log Out if you want to sign out this current phone.');
      return;
    }

    Alert.alert(
      'Remove this device?',
      'This device will be removed from your active device list for safety.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setActiveDeviceActionId(device.id);
              await deactivateDeviceTokenById(user.uid, device.id);
              await loadDevices();
              Alert.alert('Success', 'Device removed successfully.');
            } catch (error) {
              console.error('[ProfileScreen] Failed to deactivate device:', error);
              Alert.alert('Error', error?.message || 'Could not remove this device.');
            } finally {
              setActiveDeviceActionId(null);
            }
          },
        },
      ]
    );
  };

  const handlePickPhoto = async () => {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permResult.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library in your phone settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (!result || result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Error', 'Could not read image. Please try another photo.');
        return;
      }
      setUploadingPhoto(true);
      await uploadProfilePhoto(asset.base64);
      Alert.alert('Success', 'Profile photo updated!');
    } catch (e) {
      console.error('Photo pick error:', e?.code, e?.message);
      Alert.alert('Error', e?.message || 'Something went wrong. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const required = user?.setup?.requiredHours || 486;
  const progressPct = required > 0 ? Math.min(100, (renderedHours / required) * 100) : 0;
  const estimatedEndDate = user?.endDate || computeEndDate(user?.startDate, required, user?.setup?.dailyMaxHours || 8);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Modern Header with Gradient */}
        <View style={styles.headerWrapper}>
          <LinearGradient
            colors={isDark ? ['#1e1e1e', '#121212'] : ['#6366F1', '#4F46E5']}
            style={[styles.headerGradient, { height: 280 + insets.top, paddingTop: insets.top }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.headerTopActions}>
              <View style={{ width: 38 }} />
              <TouchableOpacity style={styles.headerActionBtn} onPress={handleEditProfile}>
                <MaterialCommunityIcons name="pencil-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileMainInfo}>
              <View style={styles.avatarWrapper}>
                {user?.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <MaterialCommunityIcons name="account" size={50} color="#FFFFFF" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.cameraBadge}
                  onPress={handlePickPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto
                    ? <ActivityIndicator size={12} color="#6366F1" />
                    : <MaterialCommunityIcons name="camera" size={14} color="#6366F1" />}
                </TouchableOpacity>
              </View>
              <Text style={styles.profileName}>{user?.name || 'Student Name'}</Text>
              <Text style={styles.profileEmail} ellipsizeMode="tail" numberOfLines={2}>{user?.email || 'student@email.com'}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Stats Section (Floating Card) */}
        <View style={[styles.statsCard, { backgroundColor: theme.surface, marginTop: -30 }]}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.primary }]}>{renderedHours.toFixed(1)}h</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Rendered</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? '#333' : '#E5E7EB' }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.text }]}>{required}h</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Required</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? '#333' : '#E5E7EB' }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>{progressPct.toFixed(0)}%</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Progress</Text>
            </View>
          </View>
          
          <View style={styles.progressContainer}>
            <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#333' : '#F3F4F6' }]}>
              <LinearGradient
                colors={['#6366F1', '#818CF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${progressPct}%` }]}
              />
            </View>
            <Text style={[styles.estimatedText, { color: theme.textSecondary }]}>
              Est. end: <Text style={{ color: theme.text, fontWeight: '600' }}>{estimatedEndDate || 'Calculating...'}</Text>
            </Text>
          </View>
        </View>

        {/* Info Groups */}
        <View style={styles.contentPadding}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ACADEMIC INFO</Text>
          <View style={[styles.groupContainer, { backgroundColor: theme.surface }]}>
            <InfoRow icon="school-outline" label="Program" value={user?.program || 'BSIT'} isDark={isDark} />
            <InfoRow icon="identifier" label="Student ID" value={user?.studentId || 'N/A'} isDark={isDark} />
            <InfoRow icon="calendar-outline" label="Year & Section" value={`${user?.yearLevel || '4th'} Year - ${user?.section || 'A'}`} isDark={isDark} isLast />
          </View>

          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>OJT DETAILS</Text>
          <View style={[styles.groupContainer, { backgroundColor: theme.surface }]}>
            <InfoRow icon="office-building" label="Company" value={user?.company || 'Assigning...'} isDark={isDark} />
            <InfoRow icon="account-tie-outline" label="Supervisor" value={user?.supervisor || 'N/A'} isDark={isDark} isLast />
          </View>

          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ACCOUNT</Text>
          <View style={[styles.groupContainer, { backgroundColor: theme.surface }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => toggleTheme()}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: isDark ? '#333' : '#F3F4F6' }]}>
                  <MaterialCommunityIcons name="theme-light-dark" size={18} color={isDark ? '#E5E7EB' : '#4B5563'} />
                </View>
                <Text style={[styles.menuText, { color: theme.text }]}>Dark Mode</Text>
              </View>
              <Switch value={isDark} onValueChange={() => toggleTheme()} trackColor={{ true: '#6366F1' }} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleOpenDevices}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: isDark ? '#333' : '#F3F4F6' }]}>
                  <MaterialCommunityIcons name="cellphone-link" size={18} color={isDark ? '#E5E7EB' : '#4B5563'} />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: theme.text }]}>Manage Devices</Text>
                  <Text style={[styles.menuSubText, { color: theme.textSecondary }]}>{devices.length} active device{devices.length === 1 ? '' : 's'}</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: '#FEF2F2' }]}>
                  <MaterialCommunityIcons name="logout" size={18} color="#EF4444" />
                </View>
                <Text style={[styles.menuText, { color: '#EF4444' }]}>Log Out</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: isDark ? '#334155' : '#D1D5DB' }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Update your student details and keep your profile up to date.</Text>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              <View style={[styles.modalFormCard, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
                <ProfileInput
                  icon="account-outline"
                  label="Full Name"
                  placeholder="Enter your full name"
                  value={editForm.name}
                  onChangeText={(t) => setEditForm({...editForm, name: t})}
                  theme={theme}
                  isDark={isDark}
                />
                <ProfileInput
                  icon="card-account-details-outline"
                  label="Student ID"
                  placeholder="e.g. 22-011"
                  value={editForm.studentId}
                  onChangeText={(t) => setEditForm({...editForm, studentId: t})}
                  theme={theme}
                  isDark={isDark}
                />
                <ProfileInput
                  icon="school-outline"
                  label="Program"
                  placeholder="e.g. BSIT"
                  value={editForm.program}
                  onChangeText={(t) => setEditForm({...editForm, program: t})}
                  theme={theme}
                  isDark={isDark}
                />
                <ProfileInput
                  icon="calendar-text-outline"
                  label="Year Level"
                  placeholder="e.g. 4"
                  value={editForm.yearLevel}
                  onChangeText={(t) => setEditForm({...editForm, yearLevel: t})}
                  theme={theme}
                  isDark={isDark}
                  keyboardType="number-pad"
                />
                <ProfileInput
                  icon="account-group-outline"
                  label="Section"
                  placeholder="e.g. A"
                  value={editForm.section}
                  onChangeText={(t) => setEditForm({...editForm, section: t})}
                  theme={theme}
                  isDark={isDark}
                  isLast
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[
                  styles.modalCancelBtn,
                  {
                    backgroundColor: isDark ? '#1F2937' : '#EEF2FF',
                    borderColor: isDark ? '#334155' : '#D1D5DB',
                  },
                ]}
                onPress={() => setEditVisible(false)}
                disabled={saving}
              >
                <Text style={[styles.modalCancelBtnText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#6366F1' }]} onPress={saveEdit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={devicesVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Manage Devices</Text>
              <TouchableOpacity onPress={() => setDevicesVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.devicesInfoBanner, { backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF' }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={16} color={isDark ? '#818CF8' : '#4F46E5'} />
              <Text style={[styles.devicesInfoText, { color: isDark ? '#C7D2FE' : '#4F46E5' }]}>Review active sessions and remove devices you do not recognize.</Text>
            </View>

            <View style={styles.devicesHeaderActions}>
              <Text style={[styles.devicesHeaderInfo, { color: theme.textSecondary }]}>Active devices: {devices.length}</Text>
              <View style={styles.devicesHeaderRightActions}>
                <TouchableOpacity
                  style={[
                    styles.devicesRefreshBtn,
                    { 
                      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
                      borderColor: isDark ? 'rgba(79, 70, 229, 0.3)' : '#C7D2FE'
                    },
                    devicesLoading && { opacity: 0.6 }
                  ]}
                  disabled={devicesLoading}
                  onPress={() => loadDevices()}
                >
                  {devicesLoading
                    ? <ActivityIndicator size={12} color={isDark ? '#818CF8' : "#4F46E5"} />
                    : <MaterialCommunityIcons name="refresh" size={14} color={isDark ? '#818CF8' : "#4F46E5"} />}
                </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.devicesDangerBtn,
                  { 
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA'
                  },
                  signingOutOthers && { opacity: 0.6 }
                ]}
                disabled={signingOutOthers}
                onPress={handleLogoutOtherDevices}
              >
                {signingOutOthers
                  ? <ActivityIndicator size={12} color={isDark ? '#FCA5A5' : "#EF4444"} />
                  : <MaterialCommunityIcons name="shield-lock-outline" size={14} color={isDark ? '#FCA5A5' : "#EF4444"} />}
                <Text style={[styles.devicesDangerText, { color: isDark ? '#FCA5A5' : '#EF4444' }]}>Log out other devices</Text>
              </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 20 }} contentContainerStyle={{ paddingBottom: 24 }}>
              {devicesLoading ? (
                <View style={styles.devicesEmptyWrap}>
                  <ActivityIndicator color={theme.primary} />
                  <Text style={[styles.devicesEmptyText, { color: theme.textSecondary }]}>Loading devices...</Text>
                </View>
              ) : devices.length === 0 ? (
                <View style={styles.devicesEmptyWrap}>
                  <MaterialCommunityIcons name="cellphone-off" size={24} color={theme.textSecondary} />
                  <Text style={[styles.devicesEmptyText, { color: theme.textSecondary }]}>No active devices found yet.</Text>
                </View>
              ) : (
                [...devices]
                  .sort((a, b) => new Date(b?.updated_at || 0).getTime() - new Date(a?.updated_at || 0).getTime())
                  .map((device) => {
                  const isCurrent = currentToken && device.token === currentToken;
                  const isProcessing = activeDeviceActionId === device.id;
                  return (
                    <View key={device.id} style={[styles.deviceRow, { borderColor: isDark ? '#2D2D2D' : '#E5E7EB', backgroundColor: isDark ? '#1a1a1a' : '#F9FAFB' }]}>
                      <View style={styles.deviceRowMain}>
                        <View style={[
                          styles.deviceBadge, 
                          { backgroundColor: isCurrent 
                              ? (isDark ? 'rgba(79, 70, 229, 0.25)' : '#E0E7FF') 
                              : (isDark ? '#2D2D2D' : '#EEF2FF') 
                          }
                        ]}>
                          <MaterialCommunityIcons name={device.device_type === 'ios' ? 'apple' : 'android'} size={16} color={isCurrent ? '#4F46E5' : (isDark ? '#818CF8' : '#6366F1')} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.deviceTitle, { color: theme.text }]}>
                            {String(device.device_type || 'device').toUpperCase()} {isCurrent ? '(This device)' : ''}
                          </Text>
                          {!!device.platform && (
                            <Text style={[styles.devicePlatform, { color: theme.textSecondary }]} numberOfLines={1}>
                              {device.platform}
                            </Text>
                          )}
                          <Text style={[styles.deviceMeta, { color: theme.textSecondary }]}>Last active: {formatDeviceUpdatedAt(device.updated_at)}</Text>
                        </View>
                      </View>

                      {!isCurrent && (
                        <TouchableOpacity
                          style={[
                            styles.deviceRemoveBtn,
                            { 
                              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                              borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FECACA'
                            },
                            isProcessing && { opacity: 0.6 }
                          ]}
                          disabled={isProcessing}
                          onPress={() => handleDeactivateSingleDevice(device)}
                        >
                          {isProcessing
                            ? <ActivityIndicator size={12} color={isDark ? '#FCA5A5' : "#EF4444"} />
                            : <MaterialCommunityIcons name="logout-variant" size={14} color={isDark ? '#FCA5A5' : "#EF4444"} />}
                          <Text style={[styles.deviceRemoveText, { color: isDark ? '#FCA5A5' : '#EF4444' }]}>{isProcessing ? 'Removing...' : 'Log out'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, value, isDark, isLast }) {
  return (
    <View style={[styles.infoRow, !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? '#2D2D2D' : '#F3F4F6' }]}>
      <View style={styles.infoRowLeft}>
        <MaterialCommunityIcons name={icon} size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
        <Text style={[styles.infoRowLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>{label}</Text>
      </View>
      <Text style={[styles.infoRowValue, { color: isDark ? '#E5E7EB' : '#1F2937' }]}>{value}</Text>
    </View>
  );
}

function ProfileInput({
  icon,
  label,
  value,
  onChangeText,
  theme,
  isDark,
  placeholder,
  keyboardType = 'default',
  isLast,
}) {
  return (
    <View style={[styles.profileInputRow, !isLast && styles.profileInputRowBorder]}>
      <View style={styles.profileInputLabelRow}>
        <MaterialCommunityIcons name={icon || 'circle-outline'} size={14} color={theme.textSecondary} />
        <Text style={[styles.profileInputLabel, { color: theme.textSecondary }]}>{label.toUpperCase()}</Text>
      </View>

      <TextInput
        style={[
          styles.profileInput,
          {
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            color: theme.text,
            borderColor: isDark ? '#374151' : '#DDE3EE',
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#6B7280' : '#94A3B8'}
        keyboardType={keyboardType}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  headerWrapper: { overflow: 'hidden' },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 42, borderBottomLeftRadius: 35, borderBottomRightRadius: 35 },
  headerTopActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  headerActionBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  profileMainInfo: { alignItems: 'center', marginTop: 8, marginBottom: 28, width: '100%', paddingHorizontal: 16 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatarImage: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
  },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: '#FFFFFF',
    width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2,
  },
  profileName: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  profileEmail: { fontSize: 12, color: 'rgba(255,255,255,0.95)', marginTop: 4, fontWeight: '500', textAlign: 'center', lineHeight: 16, width: '85%', paddingHorizontal: 12 },
  statsCard: {
    marginHorizontal: 20, borderRadius: 24, padding: 20,
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 15,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  statDivider: { width: 1, height: 25 },
  progressContainer: { width: '100%' },
  progressBarTrack: { height: 7, borderRadius: 4, width: '100%', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  estimatedText: { fontSize: 11, marginTop: 10, textAlign: 'center' },
  contentPadding: { paddingHorizontal: 20, marginTop: 25 },
  sectionHeader: { fontSize: 11, fontWeight: '800', marginBottom: 10, marginLeft: 5, letterSpacing: 1 },
  groupContainer: { borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  infoRowLeft: { flexDirection: 'row', alignItems: 'center' },
  infoRowLabel: { fontSize: 13, marginLeft: 12, fontWeight: '500' },
  infoRowValue: { fontSize: 13, fontWeight: '700' },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuIconBg: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuText: { fontSize: 14, fontWeight: '600', marginLeft: 12 },
  menuSubText: { fontSize: 11, fontWeight: '500', marginLeft: 12, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 12, maxHeight: '90%' },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 99,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 24,
    paddingBottom: 14,
    lineHeight: 18,
  },
  modalBody: { paddingHorizontal: 20 },
  modalBodyContent: { paddingBottom: 12 },
  modalFormCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  profileInputRow: {
    paddingVertical: 12,
  },
  profileInputRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  profileInputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  profileInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  profileInput: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: 52,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  devicesHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  devicesInfoBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devicesInfoText: { fontSize: 11, fontWeight: '500', flex: 1 },
  devicesHeaderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devicesRefreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  devicesHeaderInfo: { fontSize: 12, fontWeight: '600' },
  devicesDangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  devicesDangerText: { fontSize: 11, fontWeight: '700' },
  devicesEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  devicesEmptyText: { fontSize: 13, fontWeight: '500' },
  deviceRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  deviceRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  deviceTitle: { fontSize: 13, fontWeight: '700' },
  devicePlatform: { fontSize: 11, marginTop: 3 },
  deviceMeta: { fontSize: 11, marginTop: 4 },
  deviceRemoveBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deviceRemoveText: { fontSize: 11, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
