import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, StatusBar } from 'react-native';
import { Title, Card, Button, Chip, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../supabaseConfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

export default function AdminScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user, logout } = useAuth();
  const isSubmitting = useRef({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (isSubmitting.current['REFRESH_USERS']) return;
    isSubmitting.current['REFRESH_USERS'] = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch users: ' + error.message);
    } finally {
      isSubmitting.current['REFRESH_USERS'] = false;
      setLoading(false);
    }
  };

  const updateUserRole = async (userId, role) => {
    if (isSubmitting.current[userId]) return;
    isSubmitting.current[userId] = true;
    try {
      const { error } = await supabase.from('users').update({ role }).eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      isSubmitting.current[userId] = false;
    }
  };

  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <View style={styles.deniedContainer}>
        <MaterialCommunityIcons name="shield-lock" size={80} color={COLORS.error} />
        <Title style={styles.deniedTitle}>Access Denied</Title>
        <Text style={styles.deniedSub}>You don't have permission to access the admin panel.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <LinearGradient colors={COLORS.gradient} style={styles.header}>
        <Title style={styles.title}>Admin Panel</Title>
        <Text style={styles.subtitle}>Manage users and system controls</Text>
        
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{users.length}</Text>
            <Text style={styles.statLab}>TOTAL USERS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{users.filter(u => u.role !== 'user').length}</Text>
            <Text style={styles.statLab}>STAFF</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>User Directory</Text>
          <TouchableOpacity onPress={fetchUsers} disabled={loading}>
            <MaterialCommunityIcons 
              name="refresh" 
              size={22} 
              color={loading ? '#CCC' : COLORS.primary} 
            />
          </TouchableOpacity>
        </View>

        {users.map((userData) => (
          <Card key={userData.id} style={styles.userCard}>
            <Card.Content style={styles.userCardContent}>
              <View style={styles.userMain}>
                <View style={[styles.roleDot, { backgroundColor: userData.role === 'admin' ? '#F39C12' : COLORS.primary }]} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{userData.name || 'Anonymous'}</Text>
                  <Text style={styles.userEmail}>{userData.email}</Text>
                </View>
                <Chip style={styles.roleChip} textStyle={styles.roleChipText}>
                  {userData.role?.toUpperCase() || 'USER'}
                </Chip>
              </View>
              
              {user.role === 'super_admin' && (
                <View style={styles.actionRow}>
                  {userData.role !== 'admin' && (
                    <TouchableOpacity 
                      style={[styles.smallBtn, { backgroundColor: '#FFF9C4' }]} 
                      onPress={() => updateUserRole(userData.id, 'admin')}
                    >
                      <Text style={[styles.smallBtnText, { color: '#FBC02D' }]}>Make Admin</Text>
                    </TouchableOpacity>
                  )}
                  {userData.role !== 'user' && (
                    <TouchableOpacity 
                      style={[styles.smallBtn, { backgroundColor: '#E1F5FE' }]} 
                      onPress={() => updateUserRole(userData.id, 'user')}
                    >
                      <Text style={[styles.smallBtnText, { color: '#039BE5' }]}>Set to User</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.lg, paddingTop: 50, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5 },
  title: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2, marginBottom: 20 },
  statsContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 15, padding: 15 },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  statLab: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  scrollContent: { padding: SPACING.md, paddingBottom: 40 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  userCard: { marginBottom: 10, borderRadius: 12, elevation: 2 },
  userCardContent: { paddingVertical: 10 },
  userMain: { flexDirection: 'row', alignItems: 'center' },
  roleDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: 12, color: COLORS.textSecondary },
  roleChip: { height: 24, backgroundColor: COLORS.accent },
  roleChipText: { fontSize: 9, fontWeight: 'bold', color: COLORS.primary },
  actionRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  smallBtnText: { fontSize: 11, fontWeight: 'bold' },
  deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  deniedTitle: { marginTop: 20, color: COLORS.text, fontWeight: 'bold' },
  deniedSub: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 10 },
});
