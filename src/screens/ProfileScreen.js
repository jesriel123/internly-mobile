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
import ProgressBar from '../components/ProgressBar';
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
  const dailyMax = user?.setup?.dailyMaxHours || 8;
  const progressPct = required > 0 ? Math.min(100, (renderedHours / required) * 100) : 0;
  const estimatedEndDate = user?.endDate || computeEndDate(user?.startDate, required, dailyMax);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}>
        {/* Header Region */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Profile</Text>
          <TouchableOpacity style={[styles.editBtn, { backgroundColor: theme.surface }]} onPress={handleEditProfile}>
            <MaterialCommunityIcons name="pencil" size={14} color={theme.textSecondary} />
            <Text style={[styles.editBtnText, { color: theme.textSecondary }]}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={COLORS.gradient}
                style={styles.avatarGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="account" size={54} color="rgba(255,255,255,0.8)" style={{ marginTop: 10 }} />
              </LinearGradient>
            )}
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={handlePickPhoto}
              disabled={uploadingPhoto}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              {uploadingPhoto
                ? <ActivityIndicator size={16} color={COLORS.primary} />
                : <MaterialCommunityIcons name="camera" size={16} color={COLORS.primary} />}
            </TouchableOpacity>
          </View>

          <Text style={[styles.name, { color: theme.text }]}>{user?.name || 'Student Name'}</Text>
          <Text style={[styles.course, { color: theme.textSecondary }]}>{user?.course || 'BS Information Technology • 4th Year'}</Text>
        </View>

        {/* Progress Bar Section */}
        <View style={styles.progressContainer}>
          <ProgressBar progress={progressPct} color={COLORS.primary} trackColor={isDark ? '#2D2856' : '#e0e0e0'} height={8} showPercentage={false} />
          {/* Custom thumb to mimic the image's slider-look */}
          <View style={[styles.progressThumb, { left: `${progressPct}%` }]} />
          
          <View style={styles.progressTextRow}>
            <Text style={styles.progressStats}>
              <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>{renderedHours.toFixed(2)}h</Text>
              {' / '}
              <Text style={{ color: COLORS.primary }}>{required}h</Text>
            </Text>
            <Text style={[styles.progressStats, { color: theme.textSecondary }]}>•</Text>
            <Text style={[styles.progressStats, { color: COLORS.primary, fontWeight: 'bold' }]}>
              {progressPct.toFixed(1)}% complete
            </Text>
          </View>
        </View>

        {/* OJT Information Section */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OJT INFORMATION</Text>

        <View style={styles.infoCardList}>
          {/* Company */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.infoLeft}>
              <MaterialCommunityIcons name="office-building" size={24} color={theme.textSecondary} style={styles.infoIcon} />
              <View>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Company</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{user?.company || 'Not assigned yet'}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="lock" size={14} color="rgba(128,128,128,0.3)" />
          </View>

          {/* Supervisor */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.infoLeft}>
              <MaterialCommunityIcons name="account-tie" size={24} color={theme.textSecondary} style={styles.infoIcon} />
              <View>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Supervisor</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{user?.supervisor || 'Not assigned'}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="lock" size={14} color="rgba(128,128,128,0.3)" />
          </View>

          {/* Program */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.infoLeft}>
              <MaterialCommunityIcons name="school" size={24} color={theme.textSecondary} style={styles.infoIcon} />
              <View>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Program</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{user?.program || 'BS Information Technology'}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="lock" size={14} color="rgba(128,128,128,0.3)" />
          </View>

          {/* Start Date */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.infoLeft}>
              <MaterialCommunityIcons name="calendar" size={24} color={theme.textSecondary} style={styles.infoIcon} />
              <View>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>OJT Start Date</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{user?.startDate || 'Not set'}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="lock" size={14} color="rgba(128,128,128,0.3)" />
          </View>

          {/* End Date */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.infoLeft}>
              <MaterialCommunityIcons name="flag-checkered" size={24} color={theme.textSecondary} style={styles.infoIcon} />
              <View>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>OJT End Date</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{estimatedEndDate ? `${estimatedEndDate} (est.)` : 'Not set'}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="lock" size={14} color="rgba(128,128,128,0.3)" />
          </View>
        </View>

        {/* Dark Mode Toggle */}
        <View style={[styles.themeRow, { backgroundColor: theme.surface }]}>
          <View style={styles.themeLeft}>
            <MaterialCommunityIcons
              name={isDark ? 'weather-night' : 'weather-sunny'}
              size={20}
              color={theme.textSecondary}
            />
            <Text style={[styles.themeLabel, { color: theme.text }]}>Dark Mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#E0E0E0', true: COLORS.primary }}
            thumbColor="#fff"
            ios_backgroundColor="#E0E0E0"
          />
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={20} color="#FF5252" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>FULL NAME</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FB', borderColor: isDark ? '#333' : '#E8EAF0', color: theme.text }]} value={editForm.name} onChangeText={t => setEditForm(f => ({...f, name: t}))} placeholder="e.g. Juan dela Cruz" placeholderTextColor={theme.textSecondary} />

            <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>STUDENT ID</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FB', borderColor: isDark ? '#333' : '#E8EAF0', color: theme.text }]} value={editForm.studentId} onChangeText={t => setEditForm(f => ({...f, studentId: t}))} placeholder="e.g. 20-12345" placeholderTextColor={theme.textSecondary} />

            <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>PROGRAM / COURSE</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FB', borderColor: isDark ? '#333' : '#E8EAF0', color: theme.text }]} value={editForm.program} onChangeText={t => setEditForm(f => ({...f, program: t}))} placeholder="e.g. BSIT" placeholderTextColor={theme.textSecondary} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>YEAR LEVEL</Text>
                <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FB', borderColor: isDark ? '#333' : '#E8EAF0', color: theme.text }]} value={editForm.yearLevel} onChangeText={t => setEditForm(f => ({...f, yearLevel: t}))} placeholder="e.g. 4th" placeholderTextColor={theme.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>SECTION</Text>
                <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FB', borderColor: isDark ? '#333' : '#E8EAF0', color: theme.text }]} value={editForm.section} onChangeText={t => setEditForm(f => ({...f, section: t}))} placeholder="e.g. 4A" placeholderTextColor={theme.textSecondary} />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: isDark ? '#333' : '#E8EAF0' }]} onPress={() => setEditVisible(false)} disabled={saving}>
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  pageTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    elevation: 2, shadowColor: '#000', shadowOffset: { width:0, height:1 }, shadowOpacity: 0.1, shadowRadius: 2,
  },
  editBtnText: { color: COLORS.textSecondary, fontWeight: '600', marginLeft: 4, fontSize: 13 },

  avatarSection: { alignItems: 'center', marginBottom: SPACING.lg },
  avatarWrapper: { position: 'relative', width: 110, height: 110, marginBottom: 16 },
  avatarGradient: {
    width: 110, height: 110, borderRadius: 55,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  avatarImage: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: COLORS.primary,
  },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#fff', width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.primary,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  name: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  course: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },

  progressContainer: { marginBottom: SPACING.xl, paddingHorizontal: 10, position: 'relative' },
  progressThumb: {
    position: 'absolute', top: 3,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#D1C4E9',
    marginLeft: 3,
    borderWidth: 2, borderColor: COLORS.background,
    transform: [{ translateX: -7 }]
  },
  progressTextRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 10 },
  progressStats: { fontSize: 12, fontFamily: 'monospace' },

  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 12, marginTop: 10 },
  infoCardList: { gap: 10, marginBottom: SPACING.xl },
  infoCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center' },
  infoIcon: { marginRight: 16 },
  infoLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: 'bold', color: COLORS.text },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFEBEE', padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  logoutText: { color: '#FF5252', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },

  themeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  themeLeft: { flexDirection: 'row', alignItems: 'center' },
  themeLabel: { fontSize: 15, fontWeight: '600', marginLeft: 12 },

  // Edit Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  modalLabel: { fontSize: 10, fontWeight: '700', color: '#7C7C7C', letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  modalInput: { backgroundColor: '#F8F9FB', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8EAF0', padding: 12, fontSize: 15, color: COLORS.text },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E8EAF0', alignItems: 'center' },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '700' },
  saveBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

