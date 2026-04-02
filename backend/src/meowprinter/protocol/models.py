"""Thermal printer model specifications and registry."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PrinterModel:
    """Hardware profile for a specific thermal printer model.

    Attributes:
        paper_width: Pixels per scanline (typically 384 for 48 mm paper).
        requires_new_start: Whether the device uses the alternate start-print command.
        feed_workaround: Draw empty rows instead of issuing feed commands.
        tail_feed: Blank pixels to advance after a print job.
    """

    paper_width: int = 384
    requires_new_start: bool = False
    feed_workaround: bool = False
    tail_feed: int = 128


# Known supported models.
_DEFAULT = PrinterModel()
_NEW_KIND = PrinterModel(requires_new_start=True)
_FEED_QUIRK = PrinterModel(feed_workaround=True)
_PD01 = PrinterModel(tail_feed=50)

MODELS: dict[str, PrinterModel] = {
    # Fallback / unknown
    "_ZZ00": _DEFAULT,
    # Standard generation
    "GB01": _DEFAULT,
    "GB02": _DEFAULT,
    # Supports compressed bitmaps
    "GB03": _NEW_KIND,
    # Standard
    "GT01": _DEFAULT,
    "YT01": _DEFAULT,
    # Quirky feed behaviour
    "MX05": _FEED_QUIRK,
    "MX06": _FEED_QUIRK,
    "MX08": _FEED_QUIRK,
    # PD01 family — shorter tail feed for easy tearing
    "PD01": _PD01,
}
