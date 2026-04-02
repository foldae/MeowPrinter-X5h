"""Binary command interface for BLE thermal printers.

Builds the wire-format frames that control printing, paper feed, energy,
and bitmap transfer.  The protocol uses a fixed ``0x51 0x78`` header prefix
with CRC-8 integrity checks.
"""

from abc import ABCMeta, abstractmethod

from .crc import compute_crc8


def mirror_byte(value: int) -> int:
    """Reverse the bit order of a single byte."""
    return (
        (value & 0b10000000) >> 7
        | (value & 0b01000000) >> 5
        | (value & 0b00100000) >> 3
        | (value & 0b00010000) >> 1
        | (value & 0b00001000) << 1
        | (value & 0b00000100) << 3
        | (value & 0b00000010) << 5
        | (value & 0b00000001) << 7
    )


def encode_int(value: int, *, big_endian: bool = False, min_length: int = 1) -> bytearray:
    """Encode an integer into a variable-length ``bytearray``.

    By default the result is little-endian and at least *min_length* bytes long.
    """
    result = bytearray()
    while value != 0:
        result.append(value & 0xFF)
        value >>= 8
    if not result:
        result.append(0)
    while len(result) < min_length:
        result.append(0)
    if big_endian:
        result.reverse()
    return result


# Flow-control responses sent by the printer over the notification characteristic.
FLOW_PAUSE = b"\x51\x78\xae\x01\x01\x00\x10\x70\xff"
FLOW_RESUME = b"\x51\x78\xae\x01\x01\x00\x00\x00\xff"


class Commander(metaclass=ABCMeta):
    """Semi-abstract base that assembles binary commands for the printer.

    Concrete subclasses must implement :meth:`enqueue` which accepts raw bytes
    destined for the BLE TX characteristic.
    """

    dry_run: bool = False

    # -- frame construction ---------------------------------------------------

    def build_frame(
        self,
        command_id: int,
        payload: bytearray,
        *,
        prefix: bytearray = bytearray(),
        suffix: bytearray = bytearray(),
    ) -> bytearray:
        """Wrap *payload* in a protocol frame headed by *command_id*."""
        length = len(payload)
        if length > 0xFF:
            raise ValueError(f"Payload too large ({length} > 255)")
        header = bytearray([0x51, 0x78, command_id, 0x00, length, 0x00])
        trailer = bytearray([compute_crc8(payload), 0xFF])
        return prefix + header + payload + trailer + suffix

    # -- printer commands -----------------------------------------------------

    def cmd_start_printing(self) -> None:
        self.enqueue(bytearray([0x51, 0x78, 0xA3, 0x00, 0x01, 0x00, 0x00, 0x00, 0xFF]))

    def cmd_start_printing_v2(self) -> None:
        """Alternate start command used by newer hardware revisions."""
        self.enqueue(
            bytearray([0x12, 0x51, 0x78, 0xA3, 0x00, 0x01, 0x00, 0x00, 0x00, 0xFF])
        )

    def cmd_apply_energy(self) -> None:
        self.enqueue(self.build_frame(0xBE, encode_int(0x01)))

    def cmd_query_state(self) -> None:
        self.enqueue(self.build_frame(0xA3, encode_int(0x00)))

    def cmd_query_device_info(self) -> None:
        self.enqueue(self.build_frame(0xA8, encode_int(0x00)))

    def cmd_refresh_device(self) -> None:
        self.enqueue(self.build_frame(0xA9, encode_int(0x00)))

    def cmd_set_resolution(self) -> None:
        """Instructs the printer to use ~200 DPI."""
        self.enqueue(self.build_frame(0xA4, encode_int(50)))

    def cmd_begin_page(self) -> None:
        """Mark the start of a printed page."""
        self.enqueue(
            self.build_frame(
                0xA6,
                bytearray([0xAA, 0x55, 0x17, 0x38, 0x44, 0x5F, 0x5F, 0x5F, 0x44, 0x38, 0x2C]),
            )
        )

    def cmd_end_page(self) -> None:
        """Mark the end of a printed page."""
        self.enqueue(
            self.build_frame(
                0xA6,
                bytearray([0xAA, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17]),
            )
        )

    def cmd_retract(self, pixels: int) -> None:
        """Pull the paper back by *pixels*."""
        self.enqueue(self.build_frame(0xA0, encode_int(pixels, min_length=2)))

    def cmd_feed(self, pixels: int) -> None:
        """Advance the paper by *pixels*."""
        self.enqueue(self.build_frame(0xA1, encode_int(pixels, min_length=2)))

    def cmd_set_speed(self, value: int) -> None:
        """Set paper feed speed (lower value = faster but less stable heating)."""
        self.enqueue(self.build_frame(0xBD, encode_int(value)))

    def cmd_set_energy(self, amount: int) -> None:
        """Set thermal energy level (max ``0xFFFF``)."""
        self.enqueue(self.build_frame(0xAF, encode_int(amount)))

    def cmd_draw_row(self, bitmap_row: bytearray) -> None:
        """Send one scanline of bitmap data, performing bit-reversal."""
        mirrored = bytearray(map(mirror_byte, bitmap_row))
        self.enqueue(self.build_frame(0xA2, mirrored))

    # -- abstract interface ---------------------------------------------------

    @abstractmethod
    def enqueue(self, data: bytes | bytearray) -> None:
        """Buffer or send raw bytes to the printer."""
        ...
