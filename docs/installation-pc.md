# Desktop Installation Guide

This guide covers installing MeowPrinter on Windows, Linux, or macOS for use
as a desktop app (web UI in the browser) and via the CLI.

---

## Prerequisites

### Python 3.10 or newer

Check your version:
```bash
python --version
```

Download from [python.org](https://www.python.org/downloads/) if needed.
**On Windows**, tick "Add Python to PATH" during installation.

### Node.js 18 or newer (for the web UI)

Only needed if you want to use the browser UI. Check:
```bash
node --version
npm --version
```

Download from [nodejs.org](https://nodejs.org/).

### System libraries for optional features

| Feature | Windows | Linux (Debian/Ubuntu) | macOS |
|---|---|---|---|
| QR code scanning | Included with pyzbar wheel | `sudo apt install libzbar0` | `brew install zbar` |

---

## Installation

### 1. Create a virtual environment (recommended)

```bash
# Navigate to the backend folder
cd path/to/MeowPrinter/backend

# Create the venv
python -m venv .venv

# Activate it
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (CMD):
.venv\Scripts\activate.bat
# Linux / macOS:
source .venv/bin/activate
```

Your prompt should now start with `(.venv)`.

### 2. Install the Python package

```bash
# From inside MeowPrinter/backend/ with the venv active:
pip install -e ".[all]"
```

This installs:
- `fastapi` + `uvicorn` — web server
- `bleak` — Bluetooth LE
- `pillow` — image processing
- `pyzbar` — QR/barcode scanning
- `python-multipart` — file uploads

### 3. Build the frontend

```bash
cd ../frontend
npm install
npm run build
# Output goes to frontend/dist/
```

The server looks for the built frontend at `frontend/dist/` relative to the
package root. You only need to rebuild after editing frontend source files.

---

## Running the web UI

```bash
# From MeowPrinter/backend/ (with venv active):
python -m meowprinter.cli serve

# Or with options:
python -m meowprinter.cli serve --port 8095 --all   # listen on all interfaces
python -m meowprinter.cli serve --silent             # suppress startup logs
```

Open **http://localhost:8095** in your browser.

---

## CLI usage

```bash
# Scan for nearby printers (10-second scan)
python -m meowprinter.cli scan

# Print an image
python -m meowprinter.cli print-image photo.png --address XX:XX:XX:XX:XX:XX

# Print text
python -m meowprinter.cli print-text "Hello world" --address XX:XX:XX:XX:XX:XX

# Generate numbered tickets (preview only, no printer)
python -m meowprinter.tickets --count 5 --header "CONCERT 2026"

# Print tickets
python -m meowprinter.tickets --count 5 --header "CONCERT 2026" \
    --print --address XX:XX:XX:XX:XX:XX

# Generate an address label (preview)
python -m meowprinter.addresses \
    --name "Maria Dolores González Núñez" \
    --street "Calle Atocha nº3," \
    --city "Madrid, 28001"

# Print an address label
python -m meowprinter.addresses \
    --name "Maria Dolores González Núñez" \
    --street "Calle Atocha nº3," \
    --city "Madrid, 28001" \
    --print --address XX:XX:XX:XX:XX:XX
```

Run any command with `--help` for all available options.

---

## Finding your printer's address

1. Run `python -m meowprinter.cli scan`
2. Look for a device named `PD01`, `GB01`, or similar
3. Copy the BLE address (format: `XX:XX:XX:XX:XX:XX` on Linux/Windows,
   `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` UUID on macOS)

---

## Troubleshooting

**`bleak` not finding any devices on Windows**
- Make sure Bluetooth is enabled
- Run the terminal as Administrator (BLE scanning requires elevated permissions on some Windows versions)
- Windows 10 version 1709 or newer is required
- **Bluetooth adapter quality matters:** many cheap USB Bluetooth dongles and some built-in laptop adapters have poor or no BLE support. If scanning consistently finds nothing, try a name-brand adapter (e.g. ASUS, Intel, CSR 4.0+). The printer may also need to be within 2–3 metres on the first scan.

**`ModuleNotFoundError: No module named 'meowprinter'`**
- Make sure your venv is activated (`(.venv)` should appear in your prompt)
- Run `pip install -e ".[all]"` from inside the `backend/` folder — this must be done at least once after creating the venv
- Make sure you are running `python` from the venv (`.venv\Scripts\python.exe`), not a system Python

**Frontend not loading (blank page or 404)**
- Build the frontend first: `cd frontend && npm run build`
- The server serves from `frontend/dist/` — this folder must exist
