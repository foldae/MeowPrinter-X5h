"""Lightweight JSON-based internationalization."""

from __future__ import annotations

import json
import locale
import os
from pathlib import Path


class Translator:
    """Load locale JSON files and resolve translation keys with optional formatting."""

    def __init__(
        self,
        search_path: str | Path = "lang",
        lang: str | None = None,
        fallback: str = "en-US",
    ):
        self.fallback = fallback
        self.lang = lang or (locale.getdefaultlocale()[0] or fallback).replace("_", "-")
        self._strings: dict[str, str] = {}

        search = Path(search_path)
        fallback_file = search / f"{self.fallback}.json"
        if fallback_file.exists():
            self._strings = json.loads(fallback_file.read_text(encoding="utf-8"))

        lang_file = search / f"{self.lang}.json"
        if lang_file.exists():
            overrides = json.loads(lang_file.read_text(encoding="utf-8"))
            self._strings.update(overrides)

    def t(self, key: str, *args, **kwargs) -> str:
        """Look up *key* and format it with positional / keyword arguments."""
        template = self._strings.get(key, key)
        if args or kwargs:
            try:
                return template.format(*args, **kwargs)
            except (IndexError, KeyError):
                return template
        return template

    def __getitem__(self, keys):
        if isinstance(keys, tuple):
            return self.t(*keys)
        return self.t(keys)


def find_translator(lang: str | None = None) -> Translator:
    """Create a :class:`Translator` by searching common locale directories."""
    for candidate in ("www/lang", "lang", "locales"):
        if os.path.isdir(candidate):
            return Translator(candidate, lang=lang)
    return Translator(".", lang=lang)
