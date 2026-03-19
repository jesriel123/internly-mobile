import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LIGHT = {
  primary: '#7B68EE',
  secondary: '#9370DB',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#6B7280',
  white: '#FFFFFF',
  error: '#FF5252',
  success: '#4CAF50',
  cardShadow: 'rgba(0,0,0,0.05)',
  gradient: ['#7B68EE', '#9370DB'],
  accent: '#E8EAFF',
  tabBar: '#FFFFFF',
  tabBorder: '#E0E0E0',
  todayCard: '#F3F0FF',
  timeOutBtn: '#F0F0F5',
  isDark: false,
};

const DARK = {
  primary: '#7C3AED',
  secondary: '#9370DB',
  background: '#121212',
  surface: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  white: '#FFFFFF',
  error: '#FF5252',
  success: '#4CAF50',
  cardShadow: 'rgba(0,0,0,0.3)',
  gradient: ['#7B68EE', '#9370DB'],
  accent: '#2D2856',
  tabBar: '#1E1E1E',
  tabBorder: '#2A2A2A',
  todayCard: '#2D2856',
  timeOutBtn: '#2A2A2A',
  isDark: true,
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('internly_theme').then(val => {
      if (val === 'dark') setIsDark(true);
    });
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem('internly_theme', next ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, theme: isDark ? DARK : LIGHT }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
