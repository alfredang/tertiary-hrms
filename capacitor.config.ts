import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tertiaryinfotech.hrportal",
  appName: "HR Portal",
  webDir: "out",
  server: {
    url: "http://localhost:3000",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    scheme: "HR Portal",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#6366f1",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#6366f1",
    },
  },
};

export default config;
