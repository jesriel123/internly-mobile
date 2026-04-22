import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabaseConfig';
import { registerForPushNotifications, deactivateCurrentDeviceToken, isCurrentDeviceTokenActive } from '../utils/notificationService';
import { subscribeToNotifications } from '../utils/realtimeNotifications';

const writeAuditLog = async (userId, userName, userRole, action, details) => {
  try {
    await supabase.from('audit_logs').insert([{ user_id: userId, user_name: userName, user_role: userRole, action, details }]);
  } catch (_) {}
};

const createLoginNotification = async (userId, userName, userCompany) => {
  try {
    console.log('[AuthContext] Creating login notification for:', userName);
    
    // Get all admins and super_admins
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, role, company')
      .in('role', ['admin', 'super_admin']);

    if (adminError) {
      console.error('[AuthContext] Error fetching admins:', adminError);
      return;
    }

    // Filter recipients: admins of same company + all super_admins
    const recipients = (adminUsers || []).filter(
      u => u.role === 'super_admin' || (u.role === 'admin' && u.company === userCompany)
    );

    if (recipients.length === 0) {
      console.log('[AuthContext] No admin recipients found');
      return;
    }

    const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Create notification record
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        id: notificationId,
        sender_id: userId,
        sender_role: 'user',
        target_company: userCompany,
        target_role: 'admin',
        title: 'User Logged In',
        message: `${userName} logged in to the mobile app at ${timeString} on ${dateString}`,
        is_global: false,
        notification_type: 'user_login',
      });

    if (notifError) {
      console.error('[AuthContext] Error creating notification:', notifError);
      return;
    }

    // Create notification logs for each recipient
    const recipientIds = recipients.map(u => u.id).filter(Boolean);
    const { error: logsError } = await supabase.rpc('create_notification_logs', {
      _notification_id: notificationId,
      _recipient_ids: recipientIds,
      _default_status: 'sent',
    });

    if (logsError) {
      console.warn('[AuthContext] Failed to create notification logs:', logsError);
    } else {
      console.log('[AuthContext] Login notification created for', recipients.length, 'admins');
    }
  } catch (error) {
    console.error('[AuthContext] Error creating login notification:', error);
  }
};

export const AuthContext = createContext(null);

const AUTH_TIMEOUT_MS = 30000;
const PASSWORD_RESET_PROD_URL = 'https://internly-web.vercel.app/reset-password';

function sanitizeHttpRedirectUrl(rawValue) {
  const cleaned = String(rawValue || '').trim();
  if (!cleaned) return null;

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function timeoutError(label, ms) {
  const error = new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Please try again.`);
  error.code = 'auth/timeout';
  return error;
}

async function withTimeout(promise, label, ms = AUTH_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const ensureDeviceRegistered = useCallback(async (userId) => {
    if (!userId) return;
    try {
      await registerForPushNotifications(userId);
    } catch (error) {
      // Non-blocking: auth flow should continue even if token registration fails.
      console.warn('[AuthContext] Device registration failed:', error?.message || error);
    }
  }, []);

  const ensureCurrentDeviceStillAllowed = useCallback(async (userId, { notify = true } = {}) => {
    try {
      const isActive = await isCurrentDeviceTokenActive(userId);
      if (isActive) {
        return true;
      }

      await supabase.auth.signOut({ scope: 'local' });
      setUser(null);
      if (notify) {
        Alert.alert(
          'Session ended',
          'This device was removed from your account and has been logged out for security.'
        );
      }
      return false;
    } catch (error) {
      console.warn('[AuthContext] Device access check failed:', error?.message || error);
      return true;
    }
  }, []);

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
    const { data, error } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle(),
      'Loading user profile'
    );
    if (error) throw error;
    
    // Check if user was deleted
    if (!data) {
      // User doesn't exist in database, sign them out
      await supabase.auth.signOut();
      const deletedError = new Error('Your account has been deleted. Please contact your administrator.');
      deletedError.code = 'auth/user-deleted';
      throw deletedError;
    }
    
    return mapProfile(data, authUser);
  };

  const refreshProfile = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        'Checking current session'
      );
      if (!session?.user) {
        setUser(null);
        return null;
      }

      const allowed = await ensureCurrentDeviceStillAllowed(session.user.id);
      if (!allowed) {
        return null;
      }

      const profile = await fetchUserProfile(session.user);
      setUser(profile);
      return profile;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ensureCurrentDeviceStillAllowed]);

  useEffect(() => {
    let mounted = true;
    let userSubscription = null;
    let notificationSubscription = null;

    withTimeout(supabase.auth.getSession(), 'Checking current session')
      .then(async ({ data: { session } }) => {
        try {
          if (session?.user) {
            await ensureDeviceRegistered(session.user.id);

            const allowed = await ensureCurrentDeviceStillAllowed(session.user.id, { notify: false });
            if (!allowed) {
              return;
            }

            const profile = await fetchUserProfile(session.user);
            if (mounted) setUser(profile);
            
            // Subscribe to user changes to detect deletion
            userSubscription = supabase
              .channel(`user-${session.user.id}`)
              .on(
                'postgres_changes',
                {
                  event: 'DELETE',
                  schema: 'public',
                  table: 'users',
                  filter: `id=eq.${session.user.id}`,
                },
                async () => {
                  console.log('[AuthContext] User was deleted, signing out...');
                  await supabase.auth.signOut();
                  if (mounted) {
                    setUser(null);
                    alert('Your account has been deleted. Please contact your administrator.');
                  }
                }
              )
              .subscribe();

            // Subscribe to real-time notifications
            console.log('[AuthContext] Setting up real-time notifications...');
            notificationSubscription = subscribeToNotifications(
              session.user.id,
              (notification) => {
                console.log('[AuthContext] New notification received:', notification.title);
                // Notification will be shown automatically by realtimeNotifications.js
              }
            );
          }
        } catch (e) {
          if (mounted) setUser(null);
        } finally {
          if (mounted) setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          await ensureDeviceRegistered(session.user.id);

          // Important behavior: removing a device should end the current session,
          // but should NOT permanently block future login with correct credentials.
          // For fresh SIGNED_IN events, re-register this device token first.
          if (event !== 'SIGNED_IN') {
            const allowed = await ensureCurrentDeviceStillAllowed(session.user.id);
            if (!allowed) {
              return;
            }
          }

          const profile = await fetchUserProfile(session.user);
          if (mounted) setUser(profile);

          // Subscribe to real-time notifications on login
          if (event === 'SIGNED_IN' && !notificationSubscription) {
            console.log('[AuthContext] User signed in, subscribing to notifications...');
            notificationSubscription = subscribeToNotifications(
              session.user.id,
              (notification) => {
                console.log('[AuthContext] New notification received:', notification.title);
              }
            );
          }
        } else {
          if (mounted) setUser(null);
          
          // Unsubscribe from notifications on logout
          if (notificationSubscription) {
            console.log('[AuthContext] User signed out, unsubscribing from notifications...');
            notificationSubscription.unsubscribe();
            notificationSubscription = null;
          }
        }
      } catch (e) {
        if (e.code === 'auth/user-deleted') {
          alert(e.message);
        }
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (userSubscription) {
        supabase.removeChannel(userSubscription);
      }
      if (notificationSubscription) {
        notificationSubscription.unsubscribe();
      }
    };
  }, [ensureCurrentDeviceStillAllowed, ensureDeviceRegistered]);

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

    const checkSundayLogout = async () => {
      try {
        const lastLoginDate = await AsyncStorage.getItem('lastLoginDate');
        const now = new Date();
        const currentDay = now.getDay(); // 0 = Sunday
        
        if (currentDay === 0 && lastLoginDate) {
          const lastLogin = new Date(lastLoginDate);
          const lastLoginDay = lastLogin.getDay();
          
          // If last login was not Sunday, logout
          if (lastLoginDay !== 0) {
            Alert.alert(
              'Weekly Session Reset',
              'Your session has been automatically logged out for the weekly reset.',
              [{ text: 'OK', onPress: async () => await logout() }]
            );
          }
        }
      } catch (error) {
        console.warn('[AuthContext] Sunday logout check failed:', error);
      }
    };

    const interval = setInterval(() => {
      ensureCurrentDeviceStillAllowed(user.uid).catch(() => {});
      checkSundayLogout();
    }, 15000);

    // Check immediately on mount
    checkSundayLogout();

    return () => clearInterval(interval);
  }, [user?.uid, ensureCurrentDeviceStillAllowed]);

  const login = async (email, password) => {
    try {
      console.log('[AuthContext] Starting login for:', email);
      
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        'Signing in'
      );
      if (error) {
        console.log('[AuthContext] Auth error:', error);
        throw error;
      }
      
      console.log('[AuthContext] Auth successful, checking user in database...');
      
      // Check if user exists in database
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      
      if (userError) {
        console.log('[AuthContext] Database error:', userError);
        throw userError;
      }
      
      console.log('[AuthContext] User data:', userData ? 'Found' : 'Not found');
      
      if (!userData) {
        // User was deleted, sign them out
        console.log('[AuthContext] User not found in database, signing out...');
        await supabase.auth.signOut();
        const deletedError = new Error('Your account has been deleted. Please contact your administrator.');
        deletedError.code = 'auth/user-deleted';
        throw deletedError;
      }
      
      console.log('[AuthContext] User found, creating profile...');
      const profile = mapProfile(userData, data.user);
      setUser(profile);
      await writeAuditLog(data.user.id, profile.name || email, profile.role, 'USER_LOGIN', `${profile.name || email} logged in to the mobile app`);
      
      // Save login date for Sunday logout check
      await AsyncStorage.setItem('lastLoginDate', new Date().toISOString());
      
      // Create login notification for admins (only for regular users, not admins)
      if (profile.role === 'user') {
        await createLoginNotification(data.user.id, profile.name || email, profile.company);
      }
      
      // Register for push notifications
      await registerForPushNotifications(data.user.id);
      
      console.log('[AuthContext] Login successful!');
      return data.user;
    } catch (error) {
      console.log('[AuthContext] Login failed:', error.message);
      if (error.code === 'auth/timeout') {
        const timeoutError = new Error('Login timed out. Please check your connection and try again.');
        timeoutError.code = 'auth/timeout';
        throw timeoutError;
      }
      throw error;
    }
  };

  const register = async (email, password, userData = {}) => {
    try {
      console.log('[AuthContext] Starting registration for:', email);

      const requiredValues = {
        firstName: String(userData.firstName || '').trim(),
        middleName: String(userData.middleName || '').trim(),
        lastName: String(userData.lastName || '').trim(),
        studentId: String(userData.studentId || '').trim(),
        program: String(userData.program || '').trim(),
        yearLevel: String(userData.yearLevel || '').trim(),
        company: String(userData.company || '').trim(),
        companyAddress: String(userData.companyAddress || '').trim(),
        supervisor: String(userData.supervisor || '').trim(),
        startDate: String(userData.startDate || '').trim(),
      };
      const requiredHours = Number(userData.requiredHours);

      const hasMissingField = Object.values(requiredValues).some(value => !value);
      if (hasMissingField || !Number.isFinite(requiredHours) || requiredHours <= 0) {
        throw new Error('Please complete all required registration fields before creating an account.');
      }

      const composedName = [
        userData.firstName,
        userData.middleName,
        userData.lastName,
      ]
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .join(' ');
      const displayName = composedName || String(userData.fullName || '').trim() || email;
      const role = email.includes('admin') ? 'super_admin' : 'user';

      // Step 1: Create auth user and attach profile fields as metadata.
      // A database trigger can read these values and create the public.users row without client-side inserts.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
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
            required_hours: requiredHours,
            daily_max_hours: 8,
          },
        },
      });
      if (error) {
        console.log('[AuthContext] Auth signup error:', error);
        throw error;
      }
      
      if (!data?.user) {
        throw new Error('Failed to create user account');
      }
      
      console.log('[AuthContext] Auth signup successful, user ID:', data.user.id);

      // Step 2: Retry profile lookup for a few seconds while the DB trigger finishes.
      let userProfile = null;
      let profileError = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        ({ data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle());

        if (profileError) {
          break;
        }

        if (userProfile) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (profileError) {
        console.log('[AuthContext] Profile fetch error:', profileError.message, profileError.code);
        throw new Error(`Failed to load user profile after registration: ${profileError.message}`);
      }

      if (!userProfile) {
        throw new Error('User profile was not created. Run the registration trigger SQL in Supabase first.');
      }

      console.log('[AuthContext] User profile created successfully');

      // Step 4: Set user state
      if (data?.user) {
        setUser(mapProfile(userProfile, data.user));
      }

      console.log('[AuthContext] Registration completed successfully');
      return data.user;
    } catch (error) {
      console.log('[AuthContext] Registration failed:', error.message);
      throw error;
    }
  };

  const forgotPassword = async (email, redirectTo) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) throw new Error('Email is required.');

    const safeRedirect =
      sanitizeHttpRedirectUrl(redirectTo) ||
      sanitizeHttpRedirectUrl(process.env.EXPO_PUBLIC_PASSWORD_RESET_WEB_URL) ||
      sanitizeHttpRedirectUrl(process.env.EXPO_PUBLIC_PASSWORD_RESET_REDIRECT) ||
      PASSWORD_RESET_PROD_URL ||
      Linking.createURL('login');

    console.info('[AUTH-MOBILE] Reset redirect:', safeRedirect);

    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: safeRedirect,
      }),
      'Sending password reset email'
    );
    if (error) throw error;
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
      // Deactivate only this device token so other active devices remain signed in.
      await deactivateCurrentDeviceToken(user.uid);
    }
    await AsyncStorage.removeItem('lastLoginDate');
    const { error } = await withTimeout(supabase.auth.signOut(), 'Signing out', 8000);
    if (error) throw error;
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, forgotPassword, updateProfile, uploadProfilePhoto, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
