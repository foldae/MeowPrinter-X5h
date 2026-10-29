import { themeMode, scanTime, dryRun, transparentAsWhite} from "../hooks/useStore";
import { currentLang, setLanguage, t } from "../hooks/useI18n";
import { updateSettings } from "../utils/api-client";
import { DevicePanel } from "./DevicePanel";

export function SettingsPanel() {
  const tr = t.value;

  const syncAndSet = (key: string, value: unknown) => {
    updateSettings({ [key]: value }).catch(() => {});
  };

  return (
    <div class="settings-stack">
      <DevicePanel />
      <div class="panel card theme-settings-card">
        <h3>Theme</h3>
        <label class="settings-field" for="meowprinter-theme-select">Appearance</label>
        <select id="meowprinter-theme-select" class="select-input" value={themeMode.value} onChange={(event) => (themeMode.value = (event.target as HTMLSelectElement).value as "system" | "light" | "dark")}>
          <option value="system">Follow system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
            <div class="panel card">
      {/* Scan time */}
      <div class="form-group">
        <label>{tr("scan-time-")}</label>
        <div class="flex-row" style={{ alignItems: "center", gap: "8px" }}>
          <input
            type="number"
            class="text-input"
            style={{ width: "80px" }}
            min={1}
            max={30}
            value={scanTime.value}
            onInput={(e) => {
              const v = +(e.target as HTMLInputElement).value;
              scanTime.value = v;
              syncAndSet("scan_time", v);
            }}
          />
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{tr("-seconds")}</span>
        </div>
      </div>

      {/* Dry run */}
      <div class="form-group row-checkbox">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={dryRun.value}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).checked;
              dryRun.value = v;
              syncAndSet("dry_run", v);
            }}
          />
          <span class="checkmark" />
          {tr("dry-run")}
        </label>
      </div>

      {/* Transparent as white */}
      <div class="form-group row-checkbox">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={transparentAsWhite.value}
            onChange={(e) => (transparentAsWhite.value = (e.target as HTMLInputElement).checked)}
          />
          <span class="checkmark" />
          {tr("transparent-as-white")}
        </label>
      </div>

      <hr class="divider" />

      {/* Language */}
      <div class="form-group">
        <label>{tr("language")}</label>
        <select
          class="select-input"
          value={currentLang.value}
          onChange={(e) => {
            const lang = (e.target as HTMLSelectElement).value;
            setLanguage(lang);
            localStorage.setItem("meowprinter-lang", lang);
          }}
        >
          <option value="en-US">English</option>
          <option value="es-ES">Espanol</option>
          <option value="zh-CN">中文</option>
          <option value="de-DE">Deutsch</option>
        </select>
      </div>

      {/* Theme */}
      <div class="form-group row-checkbox">
        
      </div>
      </div>
    </div>
  );
}
