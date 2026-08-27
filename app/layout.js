import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import Nav from "./components/Nav";
import SettingsPanel from "./components/SettingsPanel";
import Footer from "./components/Footer";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "EVM Tools",
  description: "EVM transaction decoder and contract caller",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Apply the saved/system theme before hydration to avoid a flash
            of the wrong theme now that content renders during SSR */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme_preference');" +
              "if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))" +
              "document.documentElement.setAttribute('data-theme','dark');}catch(e){}",
          }}
        />
        <ThemeProvider>
          <SettingsProvider>
            <Nav />
            <SettingsPanel />
            {children}
            <Footer />
          </SettingsProvider>
        </ThemeProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
