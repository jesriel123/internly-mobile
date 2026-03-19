import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Alert, StatusBar, Modal } from 'react-native';
import { TextInput, Button, Title, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import { supabase } from '../../supabaseConfig';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function LoginScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { login, register } = useAuth();
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
    Alert.alert('Error', message);
  };

  const handleRegister = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const trimmedFirstName = firstName.trim();
    const trimmedMiddleName = middleName.trim();
    const trimmedLastName = lastName.trim();
    const composedFullName = [trimmedFirstName, trimmedMiddleName, trimmedLastName].filter(Boolean).join(' ');
    const trimmedEmail = email.trim().toLowerCase();
    
    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !password || !confirmPassword || !program || !yearLevel || !company || !companyAddress || !supervisor) {
      isSubmitting.current = false;
      showError('Please fill in all mandatory fields');
      return;
    }
    if (password !== confirmPassword) {
      isSubmitting.current = false;
      showError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      isSubmitting.current = false;
      showError('Password must be at least 6 characters');
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
        studentId: studentId.trim(),
        program: program.trim(),
        yearLevel: yearLevel.trim(),
        requiredHours: Number(requiredHours),
        startDate: startDate.trim(),
        company: company.trim(),
        companyAddress: companyAddress.trim(),
        supervisor: supervisor.trim()
      });
      Alert.alert('Success', 'Account created successfully!');
    } catch (error) {
      let message = 'Registration failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') message = 'This email is already registered. Please sign in.';
      else if (error.code === 'auth/invalid-email') message = 'The email address is not valid.';
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
      if (error.code === 'auth/user-not-found') message = 'No account found with this email address.';
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContentOuter}>
        <LinearGradient colors={[COLORS.primary, '#9370DB']} style={styles.headerBackground}>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="school" size={40} color={COLORS.primary} />
          </View>
          <Title style={styles.appTitle}>Internly</Title>
          <Text style={styles.appSubtitle}>OJT Hours & Task Tracker</Text>
        </LinearGradient>
        
        <View style={styles.formCardOuter}>
          {isRegister ? (
            <View style={styles.formSection}>
              <Title style={styles.formTitle}>Create Account ??</Title>
              <Text style={styles.formSubtitle}>Fill in your details to get started</Text>

              <Text style={styles.sectionHeading}>PERSONAL INFORMATION</Text>
              
              <View style={styles.inputContainer}>
                <TextInput label="First Name" value={firstName} onChangeText={t => { setFirstName(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Middle Name" value={middleName} onChangeText={t => { setMiddleName(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Last Name" value={lastName} onChangeText={t => { setLastName(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Student ID Number" value={studentId} onChangeText={t => { setStudentId(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="card-account-details-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Email Address" value={email} onChangeText={t => { setEmail(t); clearError(); }} mode="outlined" keyboardType="email-address" autoCapitalize="none" style={styles.input} left={<TextInput.Icon icon="email-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Password" value={password} onChangeText={t => { setPassword(t); clearError(); }} mode="outlined" secureTextEntry style={styles.input} left={<TextInput.Icon icon="lock-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Confirm Password" value={confirmPassword} onChangeText={t => { setConfirmPassword(t); clearError(); }} mode="outlined" secureTextEntry style={styles.input} left={<TextInput.Icon icon="lock-check-outline" color={COLORS.primary} />} />
              </View>

              <Text style={[styles.sectionHeading, { marginTop: 20 }]}>ACADEMIC INFORMATION</Text>

              <View style={styles.inputContainer}>
                <TextInput label="Program / Course" value={program} onChangeText={t => { setProgram(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="school-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Year Level" value={yearLevel} onChangeText={t => { setYearLevel(t); clearError(); }} mode="outlined" style={styles.input} />
              </View>

              <Text style={[styles.sectionHeading, { marginTop: 20 }]}>OJT INFORMATION</Text>

              <View style={styles.inputContainer}>
                <TextInput label="Required Hours" value={requiredHours} onChangeText={t => { setRequiredHours(t); clearError(); }} keyboardType="numeric" mode="outlined" style={styles.input} left={<TextInput.Icon icon="clock-outline" color={COLORS.primary} />} />
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
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Company Address" value={companyAddress} onChangeText={t => { setCompanyAddress(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="map-marker-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Supervisor Name" value={supervisor} onChangeText={t => { setSupervisor(t); clearError(); }} mode="outlined" style={styles.input} left={<TextInput.Icon icon="account-tie" color={COLORS.primary} />} />
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
              <Title style={styles.formTitle}>Welcome back ??</Title>
              <Text style={styles.formSubtitle}>Sign in to your account</Text>

              <View style={styles.inputContainer}>
                <TextInput label="Email" value={loginEmail} onChangeText={t => { setLoginEmail(t); clearError(); }} mode="outlined" keyboardType="email-address" autoCapitalize="none" style={styles.input} left={<TextInput.Icon icon="email-outline" color={COLORS.primary} />} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput label="Password" value={loginPassword} onChangeText={t => { setLoginPassword(t); clearError(); }} mode="outlined" secureTextEntry={!showPassword} style={styles.input} left={<TextInput.Icon icon="lock-outline" color={COLORS.primary} />} right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(!showPassword)} color={COLORS.primary} />} />
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Button mode="contained" onPress={handleLogin} loading={loading} disabled={loading} style={styles.submitBtn} labelStyle={styles.submitBtnLabel}>
                Sign In
              </Button>

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContentOuter: { flexGrow: 1 },
  headerBackground: { paddingTop: 60, paddingBottom: 60, alignItems: 'center' },
  logoContainer: { width: 80, height: 80, backgroundColor: 'white', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16, elevation: 4 },
  appTitle: { color: 'white', fontSize: 32, fontWeight: 'bold', letterSpacing: 0.5 },
  appSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, fontWeight: '500' },
  formCardOuter: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, marginTop: -30, elevation: 6 },
  formSection: { paddingBottom: 40 },
  formTitle: { fontSize: 26, fontWeight: 'bold', color: '#2D2856', marginBottom: 4 },
  formSubtitle: { fontSize: 13, color: '#7C7C7C', marginBottom: 24, fontWeight: '500' },
  sectionHeading: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary, letterSpacing: 1, marginBottom: 12 },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  inputContainer: { marginBottom: 12 },
  input: { backgroundColor: 'white' },
  errorText: { color: '#FF5252', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 6, marginTop: 12 },
  submitBtnLabel: { fontSize: 16, fontWeight: 'bold', color: 'white' },
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
});
