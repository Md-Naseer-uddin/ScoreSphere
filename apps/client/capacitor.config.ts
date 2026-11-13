import type { CapacitorConfig } from '@capacitor/cli';

// Never change appId, androidScheme or hostname after the first APK ships:
// the WebView origin keys all local data, so changing it wipes offline matches (ADR 0003).
const config: CapacitorConfig = {
  appId: 'com.scoresphere.app',
  appName: 'ScoreSphere',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};

export default config;
