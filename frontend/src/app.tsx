import { useEffect } from "preact/hooks";
import { activeTab, theme, energy, quality, scanTime, dryRun } from "./hooks/useStore";
import { getSettings } from "./utils/api-client";
import { setLanguage } from "./hooks/useI18n";
import { t } from "./hooks/useI18n";

import { DevicePanel } from "./components/DevicePanel";
import { PrintSettings } from "./components/PrintSettings";
import { SettingsPanel } from "./components/SettingsPanel";
import { CanvasArea } from "./components/CanvasArea";
import { Navigation } from "./components/Navigation";

export function App() {
  const tr = t.value;
  const currentTheme = theme.value;
  const tab = activeTab.value;

  // Load backend settings on first mount.
  useEffect(() => {
    getSettings()
      .then((s) => {
        energy.value = s.energy;
        quality.value = s.quality;
        scanTime.value = s.scan_time;
        dryRun.value = s.dry_run;
      })
      .catch(() => {});

    // Try to restore saved language
    const savedLang = localStorage.getItem("meowprinter-lang");
    if (savedLang) setLanguage(savedLang);

    // Try to restore saved theme
    const savedTheme = localStorage.getItem("meowprinter-theme");
    if (savedTheme === "dark" || savedTheme === "light") theme.value = savedTheme;
  }, []);

  // Persist theme & lang to localStorage whenever they change.
  useEffect(() => {
    localStorage.setItem("meowprinter-theme", currentTheme);
    document.documentElement.setAttribute("data-theme", currentTheme);
  }, [currentTheme]);

  return (
    <div class="app-layout" data-theme={currentTheme}>
      <aside class="sidebar">
        <header class="sidebar-header">
          <img
            src="/meowprinter_logo.png"
            alt="MeowPrinter"
            class="logo-img"
          />
          MeowPrinter
        </header>

        <main class="sidebar-content">
          {tab === "print" && (
            <>
              <DevicePanel />
              <PrintSettings />
            </>
          )}
          {tab === "settings" && <SettingsPanel />}
          {tab === "about" && (
            <div class="panel card">
              <p style={{ color: "var(--text-muted)", lineHeight: "1.6", fontSize: "14px" }}>
                <strong>MeowPrinter v1.0</strong>
                <br />
                Open-source BLE thermal printer control panel.
                <br /><br />
                Supports models: PD01, GB01, GB02, GB03, GT01, YT01, MX05, MX06, MX08.
                <br /><br />
                Built with Preact + FastAPI.
                <br /><br />
                Developed by <strong>elyez-dev</strong>.
              </p>
            </div>
          )}
        </main>

        <Navigation />
      </aside>

      <CanvasArea />
    </div>
  );
}
