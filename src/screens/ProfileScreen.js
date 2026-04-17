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
  const isSubmitting = useRef(false);

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
    }, [refreshProfile])
  );

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
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <ProfileInput label="Full Name" value={editForm.name} onChangeText={(t) => setEditForm({...editForm, name: t})} theme={theme} />
              <ProfileInput label="Student ID" value={editForm.studentId} onChangeText={(t) => setEditForm({...editForm, studentId: t})} theme={theme} />
              <ProfileInput label="Program" value={editForm.program} onChangeText={(t) => setEditForm({...editForm, program: t})} theme={theme} />
              <ProfileInput label="Year Level" value={editForm.yearLevel} onChangeText={(t) => setEditForm({...editForm, yearLevel: t})} theme={theme} />
              <ProfileInput label="Section" value={editForm.section} onChangeText={(t) => setEditForm({...editForm, section: t})} theme={theme} />
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#6366F1' }]} onPress={saveEdit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
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

function ProfileInput({ label, value, onChangeText, theme }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 6 }}>{label.toUpperCase()}</Text>
      <TextInput
        style={{ 
          backgroundColor: theme.isDark ? '#1a1a1a' : '#F9FAFB', 
          color: theme.text, 
          padding: 12, 
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.isDark ? '#333' : '#E5E7EB'
        }}
        value={value}
        onChangeText={onChangeText}
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 15, marginBottom: 25 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
