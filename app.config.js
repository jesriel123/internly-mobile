module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE ||
    config.android?.googleServicesFile;

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};