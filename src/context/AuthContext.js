import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseConfig';
import { registerForPushNotifications, deactivateDeviceToken } from '../utils/notificationService';

const writeAuditLog = async (userId, userName, userRole, action, details) => {
  try {
    await supabase.from('audit_logs').insert([{ user_id: userId, user_name: userName, user_role: userRole, action, details }]);
  } catch (_) {}
};

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const mapProfile = (data, authUser) => {
    if (!data) {
      return {
        uid: authUser.id,
        email: authUser.email,
        name: authUser.email,
        role: 'user',
        company: '',
        companyAddress: '',
        supervisor: '',
        program: '',
        yearLevel: '',
        section: '',
        studentId: '',
        startDate: '',
        endDate: '',
        photoURL: null,
        setup: { requiredHours: 486, dailyMaxHours: 8 },
      };
    }

    const requiredHours = Number(
      data.required_hours ?? data.setup?.requiredHours ?? data.setup?.required_hours ?? 486
    );
    const dailyMaxHours = Number(
      data.daily_max_hours ?? data.setup?.dailyMaxHours ?? data.setup?.daily_max_hours ?? 8
    );

    return {
      uid: data.id,
      email: data.email || authUser.email,
      name: data.name || authUser.email,
      role: data.role || 'user',
      company: data.company || '',
      companyAddress: data.company_address || data.companyAddress || '',
      supervisor: data.supervisor || '',
      program: data.program || '',
      yearLevel: data.year_level || data.yearLevel || '',
      section: data.section || '',
      studentId: data.student_id || data.studentId || '',
      startDate: data.start_date || data.startDate || '',
      endDate: data.end_date || data.endDate || '',
      photoURL: data.photo_url || data.photoURL || null,
      setup: {
        requiredHours: Number.isFinite(requiredHours) ? requiredHours : 486,
        dailyMaxHours: Number.isFinite(dailyMaxHours) ? dailyMaxHours : 8,
      },
    };
  };

  const fetchUserProfile = async (authUser) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) throw error;
    return mapProfile(data, authUser);
  };

  const refreshProfile = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setUser(null);
        return null;
      }
      const profile = await fetchUserProfile(session.user);
      setUser(profile);
      return profile;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) {
          const profile = await fetchUserProfile(session.user);
          if (mounted) setUser(profile);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          const profile = await fetchUserProfile(session.user);
          if (mounted) setUser(profile);
        } else {
          if (mounted) setUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await fetchUserProfile(data.user);
    setUser(profile);
    await writeAuditLog(data.user.id, profile.name || email, profile.role, 'USER_LOGIN', `${profile.name || email} logged in to the mobile app`);
    
    // Register for push notifications
    await registerForPushNotifications(data.user.id);
    
    return data.user;
  };

  const register = async (email, password, userData = {}) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const role = email.includes('admin') ? 'super_admin' : 'user';
    const composedName = [
      userData.firstName,
      userData.middleName,
      userData.lastName,
    ]
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(' ');
    const displayName = composedName || String(userData.fullName || '').trim() || email;

    const { error: insertError } = await supabase.from('users').insert([{
      id: data.user.id,
      email,
      name: displayName,
      role,
      student_id: userData.studentId || '',
      program: userData.program || '',
      year_level: userData.yearLevel || '',
      section: userData.section || '',
      company: userData.company || '',
      company_address: userData.companyAddress || '',
      supervisor: userData.supervisor || '',
      start_date: userData.startDate || '',
      required_hours: userData.requiredHours || 486,
      daily_max_hours: 8,
    }]);
    if (insertError) throw insertError;

    if (data?.user) {
      setUser(mapProfile({
        id: data.user.id,
        email,
        name: displayName,
        role,
        student_id: userData.studentId || '',
        program: userData.program || '',
        year_level: userData.yearLevel || '',
        section: userData.section || '',
        company: userData.company || '',
        company_address: userData.companyAddress || '',
        supervisor: userData.supervisor || '',
        start_date: userData.startDate || '',
        required_hours: userData.requiredHours || 486,
        daily_max_hours: 8,
      }, data.user));
    }

    return data.user;
  };

  const updateProfile = async (fields) => {
    // Map camelCase fields to snake_case for DB
    const dbFields = {};
    if (fields.name !== undefined) dbFields.name = fields.name;
    if (fields.studentId !== undefined) dbFields.student_id = fields.studentId;
    if (fields.program !== undefined) dbFields.program = fields.program;
    if (fields.yearLevel !== undefined) dbFields.year_level = fields.yearLevel;
    if (fields.section !== undefined) dbFields.section = fields.section;
    if (fields.photoURL !== undefined) dbFields.photo_url = fields.photoURL;
    dbFields.updated_at = new Date().toISOString();

    const { error } = await supabase.from('users').update(dbFields).eq('id', user.uid);
    if (error) throw error;
    setUser(prev => ({ ...prev, ...fields }));
  };

  const uploadProfilePhoto = async (base64) => {
    const photoURL = `data:image/jpeg;base64,${base64}`;
    await updateProfile({ photoURL });
    return photoURL;
  };

  const logout = async () => {
    if (user) {
      await writeAuditLog(user.uid, user.name || user.email, user.role, 'USER_LOGOUT', `${user.name || user.email} logged out of the mobile app`);
      // Deactivate push token
      await deactivateDeviceToken(user.uid);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateProfile, uploadProfilePhoto, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
