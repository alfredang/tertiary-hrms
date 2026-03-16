import type { CapacitorConfig } from "@capacitor/cli";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: ".env.local" });

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
      androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
      forceCodeForRefreshToken: false,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0f172a",
    },
  },
};

export default config;
