import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import Nav from "./components/Nav";
import SettingsPanel from "./components/SettingsPanel";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "EVM Tools",
  description: "EVM transaction decoder and contract caller",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <SettingsProvider>
            <Nav />
            <SettingsPanel />
            {children}
          </SettingsProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
