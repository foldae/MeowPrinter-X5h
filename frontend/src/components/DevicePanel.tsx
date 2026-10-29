import { useState } from "preact/hooks";
import { scanDevices, connectDevice } from "../utils/api-client";
import {
  devices, isScanning, selectedDevice, isConnected,
  connectionStatus, statusMessage,
} from "../hooks/useStore";
import { t } from "../hooks/useI18n";

const LAST_PRINTER_KEY = "meowprinter-last-device";

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
      if (found.length > 0 && !selectedDevice.value) selectedDevice.value = found[0];
      statusMessage.value = found.length
        ? tr("found-0-available-devices", found.length)
        : tr("no-available-devices-found");
    } catch (error) {
      statusMessage.value = String(error);
    } finally {
      isScanning.value = false;
    }
  };

  const handleConnect = async () => {
    const device = selectedDevice.value;
    if (!device) return;
    connectionStatus.value = "connecting";
    statusMessage.value = `${tr("connecting")}...`;
    try {
      await connectDevice(device.name, device.address);
      isConnected.value = true;
      connectionStatus.value = "connected";
      localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify(device));
      statusMessage.value = tr("connected-to-0-1", device.name, device.address);
    } catch (error) {
      isConnected.value = false;
      connectionStatus.value = "error";
      statusMessage.value = String(error);
    }
  };

  const onSelect = (event: Event) => {
    const address = (event.target as HTMLSelectElement).value;
    const device = devList.find((item) => item.address === address);
    if (!device) return;
    selectedDevice.value = device;
    isConnected.value = false;
    connectionStatus.value = "idle";
  };

  return (
    <section class="printer-settings-section">
      <div class="section-heading-row">
        <div>
          <h3>Printer</h3>
          <p class="settings-help">Scan, select and connect your thermal printer.</p>
        </div>
        <span class={`settings-connection-state ${connected ? "connected" : "disconnected"}`}>
          {connected ? `Connected: ${selected?.name ?? "Printer"}` : "Disconnected"}
        </span>
      </div>

      <div class="panel card device-settings-card">
        <div class="flex-between">
          <select class="select-input" style={{ flex: 1 }} value={selected?.address ?? ""} onChange={onSelect}>
            <option value="" disabled selected={!selected}>{tr("device-select-placeholder")}</option>
            {selected && !devList.some((item) => item.address === selected.address) && (
              <option value={selected.address}>{selected.name} ({selected.address})</option>
            )}
            {devList.map((device) => (
              <option key={device.address} value={device.address}>{device.name} ({device.address})</option>
            ))}
          </select>
          <button class="btn-icon help-toggle" title={tr("help")} onClick={() => setShowHelp(!showHelp)} style={{ marginLeft: "8px" }}>?</button>
        </div>
        {showHelp && <div class="device-help-hint"><span>{tr("device-help-hint")}</span></div>}
        <div class="flex-row">
          <button class="btn-secondary" style={{ flex: 1 }} onClick={handleScan} disabled={scanning}>
            {scanning ? tr("scanning-for-devices") : tr("scan")}
          </button>
          <button class={`btn-primary ${connected ? "connected" : ""}`} style={{ flex: 1 }} onClick={handleConnect} disabled={!selected || connected || connSt === "connecting"}>
            {connSt === "connecting" ? `${tr("connecting")}...` : connected ? tr("connected") : tr("connect")}
          </button>
        </div>
        {statusMessage.value && <p class="status-msg">{statusMessage.value}</p>}
      </div>
    </section>
  );
}
