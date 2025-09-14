import 'dotenv/config';

export default {
  expo: {
    name: 'TP-7 Audio Recorder',
    slug: 'tp7-audio-recorder',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#ffffff'
      }
    },
    web: {},
    extra: {
      groqApiKey: process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '',
    },
  },
};