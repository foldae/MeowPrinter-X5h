"""BLE thermal printer driver — connects, configures, and prints bitmaps.

This module provides :class:`ThermalDriver`, the central class that manages
BLE scanning, connection, and data transfer to compatible thermal printers.
"""

from __future__ import annotations

import asyncio
import io
import sys
import time
from typing import TYPE_CHECKING

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

from .protocol.commander import Commander, FLOW_PAUSE, FLOW_RESUME, mirror_byte
from .protocol.models import MODELS, PrinterModel

if TYPE_CHECKING:
    from bleak.backends.device import BLEDevice


# BLE GATT characteristics for the printer
TX_CHAR = "0000ae01-0000-1000-8000-00805f9b34fb"
RX_CHAR = "0000ae02-0000-1000-8000-00805f9b34fb"


class DriverError(Exception):
    """Raised when something goes wrong during a print job."""

    def __init__(self, key: str, detail: str = ""):
        super().__init__(key)
        self.key = key
        self.detail = detail


# ---------------------------------------------------------------------------
# Bitmap payload — reads / writes PBM (P4) image data
# ---------------------------------------------------------------------------

class BitmapPayload:
    """In-memory container for monochrome PBM bitmap data.

    Supports reading one or more concatenated PBM images and streaming the
    raw bitmap bytes back out in fixed-size chunks.
    """

    _CHUNK = 4 * 1024 * 1024

    def __init__(self, width: int, source: io.BufferedIOBase | None = None):
        self.width = width
        self._row_bytes = width // 8
        self.height = 0
        self.pages: list[int] = []
        self._buffer = io.BytesIO()
        if source is not None:
            self.load_pbm(source)

    def append(self, data: bytes | bytearray) -> None:
        self._buffer.write(data)
        self.height = self._buffer.tell() // self._row_bytes

    def load_pbm(self, stream: io.BufferedIOBase) -> None:
        """Parse one or more concatenated PBM (P4) images from *stream*."""
        while signature := stream.readline():
            if signature.strip() != b"P4":
                raise DriverError("invalid-pbm", "Input is not a PBM image")
            # Skip comment lines
            while True:
                line = stream.readline().rstrip(b"\n")
                if not line.startswith(b"#"):
                    break
            width, height = map(int, line.split(b" "))
            if width != self.width:
                raise DriverError(
                    "width-mismatch",
                    f"Expected {self.width}px, got {width}px",
                )
            self.pages.append(height)
            self.height += height
            expected = self._row_bytes * height
            total = 0
            while chunk := stream.read(min(self._CHUNK, expected - total)):
                total += len(chunk)
                self.append(chunk)
            if total != expected:
                raise DriverError("broken-pbm", "Truncated PBM data")
        if stream is not sys.stdin.buffer:
            stream.close()

    def iter_rows(self) -> bytes:
        """Yield the bitmap one row (``width // 8`` bytes) at a time."""
        self._buffer.seek(0)
        while row := self._buffer.read(self._row_bytes):
            yield row
        self._buffer.seek(0)

    def to_single_pbm(self) -> bytes:
        """Return the entire bitmap as a single PBM image."""
        self._buffer.seek(0)
        header = f"P4\n{self.width} {self.height}\n".encode("ascii")
        return header + self._buffer.read()


# ---------------------------------------------------------------------------
# Bitmap flipping
# ---------------------------------------------------------------------------

def flip_bitmap(
    buffer: io.BytesIO,
    width: int,
    height: int,
    *,
    horizontal: bool = False,
    vertical: bool = True,
) -> io.BytesIO:
    """Return a new BytesIO with the bitmap flipped along the requested axes."""
    row_bytes = width // 8
    buffer.seek(0)

    if not horizontal and not vertical:
        return buffer

    stage = buffer
    if horizontal:
        flipped = io.BytesIO()
        while row := stage.read(row_bytes):
            mirrored = bytearray(map(mirror_byte, row))
            mirrored.reverse()
            flipped.write(mirrored)
        flipped.seek(0)
        stage = flipped

    if vertical:
        result = io.BytesIO()
        for i in range(height - 1, -1, -1):
            stage.seek(i * row_bytes)
            result.write(stage.read(row_bytes))
        result.seek(0)
        return result

    return stage


# ---------------------------------------------------------------------------
# Main driver
# ---------------------------------------------------------------------------

class ThermalDriver(Commander):
    """High-level interface to a BLE thermal printer.

    Manages device discovery, connection, and the print-job lifecycle
    (prepare → draw rows → finish).
    """

    def __init__(self) -> None:
        self._loop = asyncio.get_event_loop_policy().new_event_loop()
        self.model: PrinterModel = MODELS["_ZZ00"]
        self.device: BleakClient | None = None

        # Scan / connection settings
        self.scan_time: float = 6.0
        self.connection_timeout: float = 5.0
        self.connection_retries: int = 3
        self.retry_delay: float = 1.0

        # Print settings
        self.energy: int | None = 0x4000  # ~25% thermal strength, good default
        self.speed: int = 32
        self.tail_feed: int = self.model.tail_feed
        self.tail_feed_override: int | None = None

        self.flip_h: bool = False
        self.flip_v: bool = False
        self.dry_run: bool = False
        self.fake: bool = False

        # Internal state
        self._mtu = 200
        self._paused = False
        self._tx_buffer = io.BytesIO()

    # -- async helpers --------------------------------------------------------

    def _run(self, *coros):
        results = [self._loop.run_until_complete(c) for c in coros]
        return results[0] if len(results) == 1 else tuple(results)

    # -- connection -----------------------------------------------------------

    def connect(self, name: str | None = None, address: str | None = None) -> None:
        """Connect to a printer by model *name* and BLE *address*."""
        self._tx_buffer = io.BytesIO()
        if self.fake:
            return
        if self.device is not None and address and self.device.address.lower() == address.lower():
            return

        # Disconnect previous device
        if self.device is not None:
            try:
                if self.device.is_connected:
                    self._run(self.device.stop_notify(RX_CHAR))
                    self._run(self.device.disconnect())
            except Exception:
                pass
            finally:
                self.device = None

        if name is None and address is None:
            return

        self.model = MODELS.get(name, MODELS["_ZZ00"])
        if self.tail_feed_override is None:
            self.tail_feed = self.model.tail_feed
        else:
            self.tail_feed = self.tail_feed_override

        def _on_notify(_char, data):
            if data == FLOW_PAUSE:
                self._paused = True
            elif data == FLOW_RESUME:
                self._paused = False

        last_err = None
        for attempt in range(1, self.connection_retries + 1):
            self.device = BleakClient(address)
            try:
                self._run(self.device.connect(timeout=self.connection_timeout))
                self._run(self.device.start_notify(RX_CHAR, _on_notify))
                return
            except Exception as err:
                last_err = err
                try:
                    self._run(self.device.disconnect())
                except Exception:
                    pass
                self.device = None
                if attempt == self.connection_retries:
                    raise last_err
                time.sleep(self.retry_delay)

    def scan(
        self,
        identifier: str | None = None,
        *,
        use_result: bool = False,
        everything: bool = False,
    ) -> list[BLEDevice]:
        """Discover nearby BLE printers.

        If *use_result* is ``True``, connect to the first match automatically.
        If *everything* is ``True``, return all BLE devices found (not just printers).
        """
        if self.fake:
            return []
        if everything:
            return self._run(BleakScanner.discover(self.scan_time))

        if identifier and "," in identifier:
            name, address = identifier.split(",", 1)
            if use_result:
                self.connect(name, address)
            from bleak.backends.device import BLEDevice as _BLE
            return [_BLE(address, name)]

        devices = [
            d for d in self._run(BleakScanner.discover(self.scan_time))
            if d.name in MODELS
        ]
        if identifier:
            if identifier in MODELS:
                devices = [d for d in devices if d.name == identifier]
            else:
                devices = [d for d in devices if d.address.lower() == identifier.lower()]
        if use_result and devices:
            self.connect(devices[0].name, devices[0].address)
        return devices

    # -- printing lifecycle ---------------------------------------------------

    scan_retries: int = 3
    scan_retry_delay: float = 1.0

    def print_pbm(self, source: io.BufferedIOBase, *, identifier: str | None = None) -> None:
        """Print a PBM image from *source*.

        If no device is connected yet, a scan+connect is attempted with retries.
        """
        self._tx_buffer = io.BytesIO()
        if self.device is None:
            for attempt in range(1, self.scan_retries + 1):
                self.scan(identifier, use_result=True)
                if self.device is not None:
                    break
                if attempt < self.scan_retries:
                    time.sleep(self.scan_retry_delay)
        if self.device is None and not self.fake:
            raise DriverError("no-devices", "No printers found")

        payload = BitmapPayload(self.model.paper_width, source)
        flip_bitmap(
            payload._buffer,
            payload.width,
            payload.height,
            horizontal=self.flip_h,
            vertical=self.flip_v,
        )
        self._begin_job()
        for row in payload.iter_rows():
            data = row if not self.dry_run else b"\x00" * len(row)
            self.cmd_draw_row(bytearray(data))
        self._end_job()

    def _begin_job(self) -> None:
        self.cmd_query_state()
        if self.model.requires_new_start:
            self.cmd_start_printing_v2()
        else:
            self.cmd_start_printing()
        self.cmd_set_resolution()
        if self.speed:
            self.cmd_set_speed(self.speed)
        if self.energy is not None:
            self.cmd_set_energy(self.energy)
        self.cmd_apply_energy()
        self.cmd_refresh_device()
        self.transmit()
        self.cmd_begin_page()

    def _end_job(self) -> None:
        self.cmd_end_page()
        self.cmd_set_speed(8)
        if self.model.feed_workaround:
            blank = bytes(self.model.paper_width // 8)
            for _ in range(self.tail_feed):
                self.cmd_draw_row(bytearray(blank))
        else:
            self.cmd_feed(self.tail_feed)
        self.cmd_query_state()
        self.transmit()

    # -- data transport -------------------------------------------------------

    def transmit(self) -> None:
        """Flush the TX buffer to the printer, respecting flow control."""
        self._tx_buffer.seek(0)
        while chunk := self._tx_buffer.read(self._mtu):
            while self._paused:
                self._run(asyncio.sleep(0.2))
            self._run(
                self.device.write_gatt_char(TX_CHAR, chunk),
                asyncio.sleep(0.02),
            )
        self._tx_buffer.seek(0)
        self._tx_buffer.truncate()

    def enqueue(self, data: bytes | bytearray) -> None:
        """Buffer data; auto-flush when the buffer exceeds the MTU threshold."""
        if self.fake:
            return
        self._tx_buffer.write(data)
        if self._tx_buffer.tell() > self._mtu * 16 and not self._paused:
            self.transmit()

    # -- cleanup --------------------------------------------------------------

    def shutdown(self) -> None:
        """Disconnect and release resources."""
        if self.device is not None:
            try:
                self._run(
                    self.device.stop_notify(RX_CHAR),
                    self.device.disconnect(),
                )
            except (BleakError, EOFError):
                self.device = None
        self._loop.close()
