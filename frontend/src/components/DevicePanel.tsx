import { useState } from "preact/hooks";
import { scanDevices, connectDevice } from "../utils/api-client";
import {
  devices,
  isScanning,
  selectedDevice,
  isConnected,
  connectionStatus,
  statusMessage,
} from "../hooks/useStore";
import { t } from "../hooks/useI18n";

export function DevicePanel() {
  const tr = t.value;
  const devList = devices.value;
  const scanning = isScanning.value;
  const selected = selectedDevice.value;
  const connected = isConnected.value;
  const connSt = connectionStatus.value;
  const [showHelp, setShowHelp] = useState(false);

  const handleScan = async () => {
    isScanning.value = true;
    statusMessage.value = tr("scanning-for-devices");
    try {
      const found = await scanDevices();
      devices.value = found;
      if (found.length > 0 && !selected) {
        selectedDevice.value = found[0];
      }
      if (found.length === 0) {
        statusMessage.value = tr("no-available-devices-found");
      } else {
        statusMessage.value = tr("found-0-available-devices", found.length);
      }
    } catch (e) {
      statusMessage.value = String(e);
    } finally {
      isScanning.value = false;
    }
  };

  const handleConnect = async () => {
    if (!selected) return;
    connectionStatus.value = "connecting";
    statusMessage.value = tr("connecting") + "...";
    try {
      await connectDevice(selected.name, selected.address);
      isConnected.value = true;
      connectionStatus.value = "connected";
      statusMessage.value = tr("connected-to-0-1", selected.name, selected.address);
    } catch (e) {
      connectionStatus.value = "error";
      statusMessage.value = String(e);
    }
  };

  const onSelect = (e: Event) => {
    const addr = (e.target as HTMLSelectElement).value;
    const dev = devList.find((d) => d.address === addr);
    if (dev) {
      selectedDevice.value = dev;
      isConnected.value = false;
      connectionStatus.value = "idle";
    }
  };

  const connectLabel = (): string => {
    switch (connSt) {
      case "connecting":
        return tr("connecting") + "...";
      case "connected":
        return tr("device-connected");
      default:
        return tr("device-connect");
    }
  };

  return (
    <div class="panel card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Device selector row with help icon */}
      <div class="flex-between">
        <select class="select-input" style={{ flex: 1 }} value={selected?.address ?? ""} onChange={onSelect}>
          <option value="" disabled selected={!selected}>
            {tr("device-select-placeholder")}
          </option>
          {devList.map((d) => (
            <option key={d.address} value={d.address}>
              {d.name} ({d.address})
            </option>
          ))}
        </select>
        <button
          class="btn-icon help-toggle"
          title={tr("help")}
          onClick={() => setShowHelp(!showHelp)}
          style={{ marginLeft: "8px" }}
        >
          <HelpIcon />
        </button>
      </div>

      {/* Help hint — only visible when ? is clicked */}
      {showHelp && (
        <div class="device-help-hint">
          <span>{tr("device-help-hint")}</span>
        </div>
      )}

      <div class="flex-row">
        <button class="btn-secondary" style={{ flex: 1, padding: "10px 8px" }} onClick={handleScan} disabled={scanning}>
          {scanning ? tr("scanning-for-devices") : tr("scan")}
        </button>
        <button
          class={`btn-primary ${connSt === "connected" ? "connected" : ""}`}
          style={{ flex: 1, padding: "10px 8px" }}
          onClick={handleConnect}
          disabled={!selected || connected || connSt === "connecting"}
        >
          {connectLabel()}
        </button>
      </div>

      {statusMessage.value && (
        <p class="status-msg">{statusMessage.value}</p>
      )}
    </div>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
