import { useEffect, useRef, useState } from "preact/hooks";
import {
  activeTab, theme, themeMode, energy, quality, scanTime, dryRun,
  isConnected, connectionStatus, selectedDevice,
} from "./hooks/useStore";
import { connectDevice, getSettings, updateSettings } from "./utils/api-client";
import { setLanguage } from "./hooks/useI18n";
import type { Device } from "./types";
import { PrintSettings } from "./components/PrintSettings";
import { SettingsPanel } from "./components/SettingsPanel";
import { DevicePanel } from "./components/DevicePanel";
import { CanvasArea } from "./components/CanvasArea";

declare global {
  interface Window {
    __MEOW_SYSTEM_DARK__?: boolean;
  }
}

const LAST_PRINTER_KEY = "meowprinter-last-device";
const THEME_MODE_KEY = "meowprinter-theme-mode";

export function App() {
  const tab = activeTab.value;
  const connectedDevice = selectedDevice.value;
  const connected = isConnected.value;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window.__MEOW_SYSTEM_DARK__ === "boolean"
      ? window.__MEOW_SYSTEM_DARK__
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    getSettings().then((settings) => {
      energy.value = settings.energy;
      quality.value = settings.quality;
      scanTime.value = settings.scan_time || 5;
      dryRun.value = settings.dry_run;
      if (!settings.scan_time || settings.scan_time === 12) {
        scanTime.value = 5;
        updateSettings({ scan_time: 5 }).catch(() => {});
      }
    }).catch(() => {});

    const savedLang = localStorage.getItem("meowprinter-lang");
    if (savedLang) setLanguage(savedLang);

    const savedMode = localStorage.getItem(THEME_MODE_KEY);
    if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
      themeMode.value = savedMode;
    }

    const raw = localStorage.getItem(LAST_PRINTER_KEY);
    if (!raw) {
      setShowPrinterSetup(true);
      return;
    }
    try {
      const device = JSON.parse(raw) as Device;
      selectedDevice.value = device;
      connectionStatus.value = "connecting";
      connectDevice(device.name, device.address).then(() => {
        isConnected.value = true;
        connectionStatus.value = "connected";
      }).catch(() => {
        isConnected.value = false;
        connectionStatus.value = "idle";
      });
    } catch {
      localStorage.removeItem(LAST_PRINTER_KEY);
      setShowPrinterSetup(true);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyDark = (dark: boolean) => setSystemDark(dark);
    const onMediaChange = (event: MediaQueryListEvent | MediaQueryList) => applyDark(event.matches);
    const onNativeTheme = (event: Event) => {
      const custom = event as CustomEvent<{ dark?: boolean }>;
      if (typeof custom.detail?.dark === "boolean") applyDark(custom.detail.dark);
      else if (typeof window.__MEOW_SYSTEM_DARK__ === "boolean") applyDark(window.__MEOW_SYSTEM_DARK__);
    };

    if (typeof window.__MEOW_SYSTEM_DARK__ === "boolean") applyDark(window.__MEOW_SYSTEM_DARK__);
    else applyDark(media.matches);

    window.addEventListener("meow-system-theme", onNativeTheme);
    media.addEventListener?.("change", onMediaChange);
    media.addListener?.(onMediaChange);
    return () => {
      window.removeEventListener("meow-system-theme", onNativeTheme);
      media.removeEventListener?.("change", onMediaChange);
      media.removeListener?.(onMediaChange);
    };
  }, []);

  useEffect(() => {
    const mode = themeMode.value;
    const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;
    theme.value = resolved;
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
    document.body.setAttribute("data-theme", resolved);
    localStorage.setItem(THEME_MODE_KEY, mode);
  }, [themeMode.value, systemDark]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty(
        "--app-header-height",
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    window.addEventListener("resize", updateHeaderHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    if (isConnected.value) setShowPrinterSetup(false);
  }, [isConnected.value]);

  const navigate = (next: "print" | "settings" | "about") => {
    activeTab.value = next;
    setMenuOpen(false);
  };

  return (
    <div class={`app-layout tab-${tab}`} data-theme={theme.value}>
      <header ref={headerRef} class="sidebar-header app-header">
        <button class="hamburger-button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
          <span /><span /><span />
        </button>
        <div class="brand-block centered-brand">
          <img src="/meowprinter_logo.png" alt="MeowPrinter" class="logo-img" />
          <span>MeowPrinter X5h</span>
        </div>
        <button
          class={`printer-status ${connected ? "is-connected" : "is-disconnected"}`}
          title={connected ? connectedDevice?.name : "No printer connected"}
          onClick={() => navigate("settings")}
          aria-label={connected ? `Connected to ${connectedDevice?.name}` : "No printer connected"}
        >
          <span class="printer-status-icon" aria-hidden="true"><PrinterStatusIcon /></span>
          <span class="printer-status-dot" aria-hidden="true" />
          <span class="printer-status-name">{connected ? connectedDevice?.name : "No printer"}</span>
        </button>
      </header>

      {tab === "print" && <section class="workspace fixed-print-workspace"><CanvasArea /></section>}

      <main class="sidebar-content scrollable-tab-content">
        {tab === "print" && <PrintSettings />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "about" && <AboutPanel />}
      </main>

      <div class={`menu-backdrop ${menuOpen ? "visible" : ""}`} onClick={() => setMenuOpen(false)} />
      <aside class={`hamburger-drawer ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <div class="drawer-header"><strong>MeowPrinter X5h</strong><button class="drawer-close" onClick={() => setMenuOpen(false)}>×</button></div>
        <button class={tab === "print" ? "active" : ""} aria-current={tab === "print" ? "page" : undefined} onClick={() => navigate("print")}>Print</button>
        <button class={tab === "settings" ? "active" : ""} aria-current={tab === "settings" ? "page" : undefined} onClick={() => navigate("settings")}>Settings</button>
        <button class={tab === "about" ? "active" : ""} aria-current={tab === "about" ? "page" : undefined} onClick={() => navigate("about")}>About</button>
      </aside>

      {showPrinterSetup && (
        <div class="modal-overlay printer-setup-overlay">
          <div class="modal-content printer-setup-modal">
            <div class="modal-header"><span>Connect a printer</span><button class="btn-icon" onClick={() => setShowPrinterSetup(false)}>×</button></div>
            <p class="printer-setup-copy">Choose the scan duration, scan nearby devices, then connect your printer. This screen is shown only until a printer has been associated.</p>
            <DevicePanel />
          </div>
        </div>
      )}
    </div>
  );
}


function PrinterStatusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function AboutPanel() {
  return (
    <div class="panel card about-panel">
      <img src="/meowprinter_logo.png" alt="MeowPrinter X5h" style={{ width: "96px" }} />
      <h2>MeowPrinter X5h</h2>
      <p><strong>Version 1.1.0-x5h.1</strong></p>
      <p>A modified MeowPrinter fork with verified X5h-DBA2 support and Android improvements.</p>
      <hr class="divider" />
      <p><strong>Modified and maintained by foldae.</strong></p>
      <p>Based on MeowPrinter, originally created by elyez-dev.</p>
      <h3>Verified support</h3>
      <ul class="about-list">
        <li>X5h-DBA2 BLE discovery, connection, and automatic reconnection</li>
        <li>Text and image printing at 384 px</li>
        <li>Android image picker and verified BLE callbacks</li>
        <li>Advanced text formatting and reduced paper use</li>
        <li>Improved mobile interface and system theme support</li>
      </ul>
      <div class="about-links">
        <a href="https://github.com/foldae/MeowPrinter-X5h" target="_blank" rel="noreferrer">Source code</a>
        <a href="https://github.com/elyez-dev/MeowPrinter" target="_blank" rel="noreferrer">Original project</a>
      </div>
      <hr class="divider" />
      <small>GPL-3.0-or-later</small>
    </div>
  );
}
