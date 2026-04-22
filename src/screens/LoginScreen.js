import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, StatusBar, Modal, Image } from 'react-native';
import { TextInput, Button, Title, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import { supabase } from '../../supabaseConfig';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITAN_LOGO = require('../../assets/icon.png');

const INPUT_THEME = {
  colors: {
    text: '#2D2856',
    onSurface: '#2D2856',
    onSurfaceVariant: '#6B7280',
    primary: COLORS.primary,
    placeholder: '#6B7280',
    outline: '#CFCFE8',
    background: '#FFFFFF',
  },
};

const getPasswordValidation = (rawPassword) => {
  const value = String(rawPassword || '');
  return {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
};

const getPasswordRequirementMessage = (validation) => {
  const missing = [];
  if (!validation.minLength) missing.push('- At least 8 characters long');
  if (!validation.uppercase) missing.push('- Must include at least one uppercase letter (A-Z)');
  if (!validation.lowercase) missing.push('- Must include at least one lowercase letter (a-z)');
  if (!validation.number) missing.push('- Must include at least one number (0-9)');
  if (!validation.special) missing.push('- Must include at least one special character (e.g. !@#$%^&*)');

  if (missing.length === 0) return '';

  return `Your password must meet the following requirements:\n${missing.join('\n')}`;
};

const formatDateMMDDYYYY = (date) => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
};

const parseDateFromInput = (value) => {
  const text = String(value || '').trim();
  const parts = text.split('/');
  if (parts.length !== 3) return new Date();

  const mm = Number(parts[0]);
  const dd = Number(parts[1]);
  const yyyy = Number(parts[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return new Date();

  const parsed = new Date(yyyy, mm - 1, dd);
  if (isNaN(parsed.getTime())) return new Date();
  return parsed;
};

const isValidDateMMDDYYYY = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const mm = Number(match[1]);
  const dd = Number(match[2]);
  const yyyy = Number(match[3]);
  const parsed = new Date(yyyy, mm - 1, dd);

  return (
    Number.isFinite(mm)
    && Number.isFinite(dd)
    && Number.isFinite(yyyy)
    && parsed.getFullYear() === yyyy
    && parsed.getMonth() === mm - 1
    && parsed.getDate() === dd
  );
};

export default function LoginScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { login, register, forgotPassword } = useAuth();
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'error',
  });

  // Register form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [program, setProgram] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  
  const [requiredHours, setRequiredHours] = useState('486');
  const [startDate, setStartDate] = useState('');
  const [startDateDraft, setStartDateDraft] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [company, setCompany] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  const isSubmitting = useRef(false);

  const clearError = useCallback(() => {
    if (errorMessage) setErrorMessage('');
  }, [errorMessage]);

  const isValidEmail = (e) => EMAIL_REGEX.test(e.trim());

  const normalizeCompanyOptions = (rows) => {
    const seen = new Set();
    const options = [];
    (rows || []).forEach(row => {
      const name = String(row?.name || row?.company || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({
        name,
        address: String(row?.address || row?.company_address || '').trim(),
      });
    });
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  };

  const fetchCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('name, address')
        .order('name', { ascending: true });
      if (error) throw error;
      setCompanyOptions(normalizeCompanyOptions(data));
    } catch (_) {
      setCompanyOptions([]);
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isRegister) return;

    fetchCompanies();

    const channel = supabase
      .channel('mobile-companies-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        () => {
          fetchCompanies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isRegister, fetchCompanies]);

  const selectCompany = (option) => {
    setCompany(option.name);
    if (option.address) setCompanyAddress(option.address);
    clearError();
    setShowCompanyPicker(false);
  };

  const openStartDatePicker = () => {
    setStartDateDraft(parseDateFromInput(startDate));
    setShowStartDatePicker(true);
  };

  const onStartDateChangeAndroid = (event, selectedDate) => {
    if (event?.type === 'set' && selectedDate) {
      setStartDate(formatDateMMDDYYYY(selectedDate));
      clearError();
    }
    setShowStartDatePicker(false);
  };

  const closeStartDatePickerIOS = () => {
    setShowStartDatePicker(false);
  };

  const confirmStartDateIOS = () => {
    setStartDate(formatDateMMDDYYYY(startDateDraft));
    clearError();
    setShowStartDatePicker(false);
  };

  const showError = (message) => {
    setErrorMessage(message);
    setFeedbackModal({
      visible: true,
      title: 'Error',
      message,
      type: 'error',
    });
  };

  const showSuccess = (message) => {
    setFeedbackModal({
      visible: true,
      title: 'Success',
      message,
      type: 'success',
    });
  };

  const closeFeedbackModal = () => {
    setFeedbackModal(prev => ({ ...prev, visible: false }));
  };

  const handleRegister = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const trimmedFirstName = firstName.trim();
    const trimmedMiddleName = middleName.trim();
    const trimmedLastName = lastName.trim();
    const composedFullName = [trimmedFirstName, trimmedMiddleName, trimmedLastName].filter(Boolean).join(' ');
    const trimmedStudentId = studentId.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedProgram = program.trim();
    const trimmedYearLevel = yearLevel.trim();
    const trimmedRequiredHours = requiredHours.trim();
    const requiredHoursNumber = Number(trimmedRequiredHours);
    const trimmedStartDate = startDate.trim();
    const trimmedCompany = company.trim();
    const trimmedCompanyAddress = companyAddress.trim();
    const trimmedSupervisor = supervisor.trim();
    
    if (
      !trimmedFirstName
      || !trimmedMiddleName
      || !trimmedLastName
      || !trimmedStudentId
      || !trimmedEmail
      || !password
      || !confirmPassword
      || !trimmedProgram
      || !trimmedYearLevel
      || !trimmedRequiredHours
      || !trimmedStartDate
      || !trimmedCompany
      || !trimmedCompanyAddress
      || !trimmedSupervisor
    ) {
      isSubmitting.current = false;
      showError('Please complete all fields in the Create Account form.');
      return;
    }

    if (!Number.isFinite(requiredHoursNumber) || requiredHoursNumber <= 0) {
      isSubmitting.current = false;
      showError('Required Hours must be a valid number greater than 0.');
      return;
    }

    if (!isValidDateMMDDYYYY(trimmedStartDate)) {
      isSubmitting.current = false;
      showError('Please enter a valid OJT Start Date in MM/DD/YYYY format.');
      return;
    }
    const passwordValidation = getPasswordValidation(password);

    if (password !== confirmPassword) {
      isSubmitting.current = false;
      showError('Passwords do not match');
      return;
    }

    const passwordError = getPasswordRequirementMessage(passwordValidation);
    if (passwordError) {
      isSubmitting.current = false;
      showError(passwordError);
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      isSubmitting.current = false;
      showError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      await register(trimmedEmail, password, {
        firstName: trimmedFirstName,
        middleName: trimmedMiddleName,
        lastName: trimmedLastName,
        fullName: composedFullName,
        studentId: trimmedStudentId,
        program: trimmedProgram,
        yearLevel: trimmedYearLevel,
        requiredHours: requiredHoursNumber,
        startDate: trimmedStartDate,
        company: trimmedCompany,
        companyAddress: trimmedCompanyAddress,
        supervisor: trimmedSupervisor
      });
      showSuccess('Account created successfully!');
    } catch (error) {
      console.log('[LoginScreen] Registration error:', error);
      let message = 'Registration failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') message = 'This email is already registered. Please sign in.';
      else if (error.code === 'auth/invalid-email') message = 'The email address is not valid.';
      else if (error.message) message = `Registration failed: ${error.message}`;
      showError(message);
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  const handleLogin = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const trimmedEmail = loginEmail.trim().toLowerCase();

    if (!trimmedEmail || !loginPassword) {
      isSubmitting.current = false;
      showError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      await login(trimmedEmail, loginPassword);
    } catch (error) {
      let message = 'Incorrect email or password. Please check your credentials and try again.';
      if (error.code === 'auth/timeout') message = 'Login timed out. Please check your connection and try again.';
      else if (error.code === 'auth/user-not-found') message = 'No account found with this email address.';
      else if (error.code === 'auth/wrong-password') message = 'Incorrect password. Please try again.';
      else if (error.code === 'auth/invalid-credential') message = 'Incorrect email or password. Please check your credentials and try again.';
      else if (error.code === 'auth/too-many-requests') message = 'Too many failed attempts. Please wait a moment before trying again.';
      else if (error.code === 'auth/network-request-failed') message = 'Network error. Please check your internet connection.';
      showError(message);
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  const toggleForm = () => {
    setIsRegister(!isRegister);
    setErrorMessage('');
    clearError();
  };

  const openForgotModal = () => {
    setResetEmail(loginEmail);
    setShowForgotModal(true);
  };

  const handleSendReset = async () => {
    if (sendingReset) return;
    const cleanEmail = String(resetEmail || '').trim().toLowerCase();
    if (!cleanEmail) {
      showError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      showError('Please enter a valid email address.');
      return;
    }

    setSendingReset(true);
    try {
      await forgotPassword(cleanEmail);
      setShowForgotModal(false);
      showSuccess('Password reset link sent. Please check your email.');
    } catch (error) {
      showError(error?.message || 'Failed to send reset email. Please try again.');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContentOuter}
        style={{ flex: 1 }}
        nestedScrollEnabled={true}
      >
        <LinearGradient colors={[COLORS.primary, '#9370DB']} style={styles.headerBackground}>
          <View style={styles.headerGlowLeft} />
          <View style={styles.headerGlowRight} />
          <View style={styles.appLogoWrap}>
            <Image source={TITAN_LOGO} style={styles.appLogo} resizeMode="cover" />
          </View>
          <Title style={styles.appTitle}>Titan</Title>
          <Text style={styles.appSubtitle}>OJT Hours & Task Tracker</Text>
        </LinearGradient>
        
        <View style={styles.formCardOuter}>
          {isRegister ? (
            <View style={styles.formSection}>
              <View style={styles.formTitleRow}>
                <View style={styles.titleAccent} />
                <Title style={styles.formTitle}>Create Account</Title>
              </View>
              <Text style={styles.formSubtitle}>Fill in your details to get started</Text>

              <Text style={styles.sectionHeading}>PERSONAL INFORMATION</Text>
              
              <View style={styles.inputContainer}>
                <TextInput label="First Name" value={firstName} onChangeText={t => { setFirstName(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Middle Name" value={middleName} onChangeText={t => { setMiddleName(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Last Name" value={lastName} onChangeText={t => { setLastName(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Student ID Number" value={studentId} onChangeText={t => { setStudentId(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="card-account-details-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Email Address" value={email} onChangeText={t => { setEmail(t); clearError(); }} mode="outlined" keyboardType="email-address" autoCapitalize="none" style={styles.input} left={<TextInput.Icon icon="email-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
                <Text style={styles.emailHint}>Use a valid, active email address so you can recover your password if you forget it.</Text>
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Password" value={password} onChangeText={t => { setPassword(t); clearError(); }} mode="outlined" secureTextEntry style={styles.input} left={<TextInput.Icon icon="lock-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              {(() => {
                const passwordValidation = getPasswordValidation(password);
                const requirementRows = [
                  { ok: passwordValidation.minLength, text: 'At least 8 characters long' },
                  { ok: passwordValidation.uppercase, text: 'Must include at least one uppercase letter (A-Z)' },
                  { ok: passwordValidation.lowercase, text: 'Must include at least one lowercase letter (a-z)' },
                  { ok: passwordValidation.number, text: 'Must include at least one number (0-9)' },
                  { ok: passwordValidation.special, text: 'Must include at least one special character (e.g. !@#$%^&*)' },
                ];

                return (
                  <View style={styles.passwordRequirementsCard}>
                    <Text style={styles.passwordRequirementsTitle}>Your password must meet the following requirements:</Text>
                    {requirementRows.map((rule) => (
                      <Text
                        key={rule.text}
                        style={[styles.passwordRequirementItem, rule.ok && styles.passwordRequirementItemMet]}
                      >
                        - {rule.text}
                      </Text>
                    ))}
                  </View>
                );
              })()}

              <View style={styles.inputContainer}>
                <TextInput label="Confirm Password" value={confirmPassword} onChangeText={t => { setConfirmPassword(t); clearError(); }} mode="outlined" secureTextEntry style={styles.input} left={<TextInput.Icon icon="lock-check-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <Text style={[styles.sectionHeading, { marginTop: 20 }]}>ACADEMIC INFORMATION</Text>

              <View style={styles.inputContainer}>
                <TextInput label="Program / Course" value={program} onChangeText={t => { setProgram(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="school-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Year Level" value={yearLevel} onChangeText={t => { setYearLevel(t); clearError(); }} mode="outlined" style={styles.input} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <Text style={[styles.sectionHeading, { marginTop: 20 }]}>OJT INFORMATION</Text>

              <View style={styles.inputContainer}>
                <TextInput label="Required Hours" value={requiredHours} onChangeText={t => { setRequiredHours(t); clearError(); }} keyboardType="numeric" mode="outlined" style={styles.input} left={<TextInput.Icon icon="clock-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TouchableOpacity activeOpacity={0.8} onPress={openStartDatePicker}>
                  <View pointerEvents="none">
                    <TextInput
                      label="OJT Start Date (MM/DD/YYYY)"
                      value={startDate}
                      mode="outlined"
                      style={styles.input}
                      editable={false}
                      left={<TextInput.Icon icon="calendar-range" color={COLORS.primary} />}
                      right={<TextInput.Icon icon="menu-down" color={COLORS.primary} />}
                      textColor="#2D2856"
                      placeholderTextColor="#6B7280"
                      selectionColor={COLORS.primary}
                      cursorColor={COLORS.primary}
                      theme={INPUT_THEME}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setShowCompanyPicker(true)}>
                  <View pointerEvents="none">
                    <TextInput
                      label="Company Name"
                      value={company}
                      mode="outlined"
                      style={styles.input}
                      editable={false}
                      left={<TextInput.Icon icon="office-building" color={COLORS.primary} />}
                      right={<TextInput.Icon icon="menu-down" color={COLORS.primary} />}
                      textColor="#2D2856"
                      placeholderTextColor="#6B7280"
                      selectionColor={COLORS.primary}
                      cursorColor={COLORS.primary}
                      theme={INPUT_THEME}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Company Address" value={companyAddress} onChangeText={t => { setCompanyAddress(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="map-marker-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Supervisor Name" value={supervisor} onChangeText={t => { setSupervisor(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account-tie" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Button mode="contained" onPress={handleRegister} loading={loading} disabled={loading} style={styles.submitBtn} labelStyle={styles.submitBtnLabel}>
                Create Account
              </Button>

              <View style={styles.switchWrapper}>
                <Text style={styles.switchPrompt}>Already have an account? </Text>
                <TouchableOpacity onPress={toggleForm} disabled={loading}>
                  <Text style={styles.switchLink}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.formSection}>
              <View style={styles.formTitleRow}>
                <View style={styles.titleAccent} />
                <Title style={styles.formTitle}>Welcome back</Title>
              </View>
              <Text style={styles.formSubtitle}>Sign in to your account</Text>

              <View style={styles.inputContainer}>
                <TextInput label="Email" value={loginEmail} onChangeText={t => { setLoginEmail(t); clearError(); }} mode="outlined" keyboardType="email-address" autoCapitalize="none" style={styles.input} left={<TextInput.Icon icon="email-outline" color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Password" value={loginPassword} onChangeText={t => { setLoginPassword(t); clearError(); }} mode="outlined" secureTextEntry={!showPassword} style={styles.input} left={<TextInput.Icon icon="lock-outline" color={COLORS.primary} />} right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(!showPassword)} color={COLORS.primary} />} textColor="#2D2856" placeholderTextColor="#6B7280" selectionColor={COLORS.primary} cursorColor={COLORS.primary} theme={INPUT_THEME} />
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Button mode="contained" onPress={handleLogin} loading={loading} disabled={loading} style={styles.submitBtn} labelStyle={styles.submitBtnLabel}>
                Sign In
              </Button>

              <TouchableOpacity
                style={styles.forgotLinkWrap}
                onPress={openForgotModal}
                disabled={loading || sendingReset}
              >
                <Text style={styles.forgotLinkText}>Forgot password?</Text>
              </TouchableOpacity>

              <View style={styles.switchWrapper}>
                <Text style={styles.switchPrompt}>No account? </Text>
                <TouchableOpacity onPress={toggleForm} disabled={loading}>
                  <Text style={styles.switchLink}>Create one</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {Platform.OS === 'android' && showStartDatePicker && (
          <DateTimePicker
            value={startDateDraft}
            mode="date"
            display="default"
            onChange={onStartDateChangeAndroid}
          />
        )}

        {Platform.OS === 'ios' && (
          <Modal visible={showStartDatePicker} transparent animationType="fade" onRequestClose={closeStartDatePickerIOS}>
            <TouchableOpacity style={styles.dateModalOverlay} activeOpacity={1} onPress={closeStartDatePickerIOS}>
              <TouchableOpacity style={styles.dateModalCard} activeOpacity={1} onPress={() => {}}>
                <Text style={styles.dateModalTitle}>Select Start Date</Text>
                <DateTimePicker
                  value={startDateDraft}
                  mode="date"
                  display="spinner"
                  onChange={(_, selectedDate) => {
                    if (selectedDate) setStartDateDraft(selectedDate);
                  }}
                />
                <View style={styles.dateModalActions}>
                  <TouchableOpacity style={styles.dateActionBtn} onPress={closeStartDatePickerIOS}>
                    <Text style={styles.dateActionText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dateActionBtn, styles.dateActionPrimary]} onPress={confirmStartDateIOS}>
                    <Text style={styles.dateActionPrimaryText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        <Modal visible={showCompanyPicker} transparent animationType="fade" onRequestClose={() => setShowCompanyPicker(false)}>
          <TouchableOpacity style={styles.companyModalOverlay} activeOpacity={1} onPress={() => setShowCompanyPicker(false)}>
            <TouchableOpacity style={styles.companyModalCard} activeOpacity={1} onPress={() => {}}>
              <Text style={styles.companyModalTitle}>Select Company</Text>
              <Text style={styles.companyModalSubtitle}>Auto-updates when new companies are added</Text>
              <ScrollView style={styles.companyList} showsVerticalScrollIndicator>
                {companiesLoading && <Text style={styles.companyInfoText}>Loading companies...</Text>}
                {!companiesLoading && companyOptions.length === 0 && (
                  <Text style={styles.companyInfoText}>No companies available yet.</Text>
                )}
                {!companiesLoading && companyOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.name}
                    style={[styles.companyOption, company === opt.name && styles.companyOptionActive]}
                    onPress={() => selectCompany(opt)}
                  >
                    <Text style={[styles.companyOptionName, company === opt.name && styles.companyOptionNameActive]}>{opt.name}</Text>
                    {!!opt.address && <Text style={styles.companyOptionAddress}>{opt.address}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={showForgotModal} transparent animationType="fade" onRequestClose={() => setShowForgotModal(false)}>
          <TouchableOpacity style={styles.forgotModalOverlay} activeOpacity={1} onPress={() => setShowForgotModal(false)}>
            <TouchableOpacity style={styles.forgotModalCard} activeOpacity={1} onPress={() => {}}>
              <Text style={styles.forgotModalTitle}>Reset Password</Text>
              <Text style={styles.forgotModalSubtitle}>Enter your email to receive a reset link.</Text>

              <TextInput
                label="Email Address"
                value={resetEmail}
                onChangeText={setResetEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="email-outline" color={COLORS.primary} />}
                textColor="#2D2856"
                placeholderTextColor="#6B7280"
                selectionColor={COLORS.primary}
                cursorColor={COLORS.primary}
                theme={INPUT_THEME}
              />

              <View style={styles.forgotActions}>
                <TouchableOpacity style={styles.forgotCancelBtn} onPress={() => setShowForgotModal(false)}>
                  <Text style={styles.forgotCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.forgotSendBtn, sendingReset && styles.forgotSendBtnDisabled]}
                  onPress={handleSendReset}
                  disabled={sendingReset}
                >
                  <Text style={styles.forgotSendText}>{sendingReset ? 'Sending...' : 'Send Link'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={feedbackModal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeFeedbackModal}
        >
          <TouchableOpacity style={styles.feedbackOverlay} activeOpacity={1} onPress={closeFeedbackModal}>
            <TouchableOpacity style={styles.feedbackCard} activeOpacity={1} onPress={() => {}}>
              <View style={styles.feedbackHeaderRow}>
                <View
                  style={[
                    styles.feedbackIcon,
                    feedbackModal.type === 'success' ? styles.feedbackIconSuccess : styles.feedbackIconError,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={feedbackModal.type === 'success' ? 'check-bold' : 'alert-circle-outline'}
                    size={16}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.feedbackTitle}>{feedbackModal.title}</Text>
              </View>
              <Text style={styles.feedbackMessage}>{feedbackModal.message}</Text>
              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  feedbackModal.type === 'success' ? styles.feedbackButtonSuccess : styles.feedbackButtonError,
                ]}
                onPress={closeFeedbackModal}
              >
                <Text style={styles.feedbackButtonText}>OK</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContentOuter: { 
    flexGrow: 1,
    minHeight: '100%', // For web compatibility
  },
  headerBackground: {
    paddingTop: 68,
    paddingBottom: 72,
    alignItems: 'center',
    overflow: 'hidden',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerGlowLeft: {
    position: 'absolute',
    top: -20,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerGlowRight: {
    position: 'absolute',
    right: -18,
    bottom: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  appLogoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
    marginBottom: 10,
    backgroundColor: 'white',
  },
  appLogo: {
    width: '100%',
    height: '100%',
  },
  appTitle: { color: 'white', fontSize: 34, fontWeight: '800', letterSpacing: 0.3 },
  appSubtitle: { color: 'rgba(255,255,255,0.84)', fontSize: 13, marginTop: 6, fontWeight: '500' },
  formCardOuter: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    padding: 24,
    marginTop: -26,
    elevation: 10,
    shadowColor: '#1F1147',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
  },
  formSection: { paddingBottom: 40 },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleAccent: {
    width: 6,
    height: 28,
    borderRadius: 99,
    backgroundColor: COLORS.primary,
    marginRight: 10,
  },
  formTitle: { fontSize: 26, fontWeight: '800', color: '#2D2856', marginBottom: 0 },
  formSubtitle: { fontSize: 13, color: '#7C7C7C', marginBottom: 24, fontWeight: '500' },
  sectionHeading: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary, letterSpacing: 1, marginBottom: 12 },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  inputContainer: { marginBottom: 14 },
  input: {
    backgroundColor: 'white',
    borderRadius: 14,
  },
  emailHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
    paddingHorizontal: 4,
  },
  passwordRequirementsCard: {
    borderWidth: 1,
    borderColor: '#E8EAF0',
    borderRadius: 14,
    backgroundColor: '#F8F9FF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  passwordRequirementsTitle: {
    fontSize: 12,
    color: '#2D2856',
    fontWeight: '700',
    marginBottom: 6,
  },
  passwordRequirementItem: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  passwordRequirementItemMet: {
    color: '#16A34A',
  },
  errorText: { color: '#FF5252', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 6, marginTop: 12 },
  submitBtnLabel: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  forgotLinkWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  forgotLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  switchWrapper: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  switchPrompt: { color: '#7C7C7C', fontSize: 14 },
  switchLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  dateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  dateModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  dateModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2856',
    marginBottom: 8,
  },
  dateModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  dateActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EAF0',
  },
  dateActionPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dateActionText: {
    color: '#7C7C7C',
    fontWeight: '600',
  },
  dateActionPrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  companyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  companyModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '70%',
  },
  companyModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2856',
  },
  companyModalSubtitle: {
    fontSize: 12,
    color: '#7C7C7C',
    marginTop: 2,
    marginBottom: 10,
  },
  companyList: {
    maxHeight: 360,
  },
  companyInfoText: {
    textAlign: 'center',
    color: '#7C7C7C',
    paddingVertical: 14,
  },
  companyOption: {
    borderWidth: 1,
    borderColor: '#E8EAF0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  companyOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#F4F0FF',
  },
  companyOptionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2856',
  },
  companyOptionNameActive: {
    color: COLORS.primary,
  },
  companyOptionAddress: {
    marginTop: 2,
    fontSize: 12,
    color: '#7C7C7C',
  },
  forgotModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  forgotModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  forgotModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2856',
  },
  forgotModalSubtitle: {
    fontSize: 12,
    color: '#7C7C7C',
    marginTop: 2,
    marginBottom: 12,
  },
  forgotActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  forgotCancelBtn: {
    borderWidth: 1,
    borderColor: '#E8EAF0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  forgotCancelText: {
    color: '#7C7C7C',
    fontWeight: '600',
  },
  forgotSendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  forgotSendBtnDisabled: {
    opacity: 0.7,
  },
  forgotSendText: {
    color: '#fff',
    fontWeight: '700',
  },
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(21, 16, 48, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: '#20144A',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  feedbackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  feedbackIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  feedbackIconError: {
    backgroundColor: '#E45757',
  },
  feedbackIconSuccess: {
    backgroundColor: '#2FA56A',
  },
  feedbackTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F1A43',
  },
  feedbackMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: '#524D77',
    marginBottom: 16,
  },
  feedbackButton: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  feedbackButtonError: {
    backgroundColor: '#E45757',
  },
  feedbackButtonSuccess: {
    backgroundColor: COLORS.primary,
  },
  feedbackButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
