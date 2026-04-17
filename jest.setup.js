// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `internly://${path}`),
  useURL: jest.fn(() => null),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    appOwnership: 'standalone',
  },
}));

// Mock react-native-paper
jest.mock('react-native-paper', () => {
  const RealModule = jest.requireActual('react-native-paper');
  return {
    ...RealModule,
    Provider: ({ children }) => children,
  };
});

// Suppress console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};
