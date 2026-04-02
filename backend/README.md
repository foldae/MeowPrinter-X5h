# MeowPrinter — Python Backend

FastAPI web server, BLE driver, image processing pipeline, and CLI for
MeowPrinter thermal cat printers.

See [../docs/installation-pc.md](../docs/installation-pc.md) for setup instructions.

## Package layout

```
src/meowprinter/
├── api.py          FastAPI app (desktop server)
├── server_lite.py  stdlib http.server (Android, no FastAPI dependency)
├── cli.py          Command-line interface
├── driver.py       BLE connection + print protocol
├── tickets.py      Numbered ticket generator
├── addresses.py    Mailing address label generator
├── i18n.py         Internationalisation helpers
├── imaging/
│   ├── badge.py    QR badge generator
│   └── pdf.py      PDF → image renderer
└── protocol/
    ├── commander.py  Printer command builder
    ├── crc.py        CRC checksum
    └── models.py     Per-model constants (GB01, PD01, …)
```

## Install

```bash
pip install -e ".[all]"
```
