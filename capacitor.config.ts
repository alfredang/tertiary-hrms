import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tertiaryinfotech.hrportal",
  appName: "Tertiary HRMS",
  webDir: "out",
  server: {
    url: "https://hrms.tertiaryinfo.tech",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    scheme: "Tertiary HRMS",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: process.env.GOOGLE_CLIENT_ID || "",
      forceCodeForRefreshToken: true,
    },
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
