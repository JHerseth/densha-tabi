"""Print the DT_VERSION stamped in the _densha.js inside an .apkg (release.sh checks it matches the release).

    python3 scripts/apkg_version.py deck.apkg      -> prints e.g. 1.2.0; exit 1 if there's no _densha.js

Handles both export formats: the legacy one (a JSON "media" map, files stored as they are) and the newer one
(a zstd-compressed protobuf "media" list, files zstd-compressed).
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import zipfile


def unzstd(data: bytes) -> bytes:
    try:
        from compression import zstd  # Python 3.14+
        return zstd.decompress(data)
    except ImportError:
        pass
    if shutil.which("zstd"):
        return subprocess.run(["zstd", "-dc"], input=data, capture_output=True, check=True).stdout
    raise RuntimeError("this .apkg is zstd-compressed: needs Python 3.14+ or the zstd command")


def _varint(b: bytes, i: int) -> tuple[int, int]:
    n = shift = 0
    while True:
        c = b[i]
        i += 1
        n |= (c & 0x7F) << shift
        shift += 7
        if not c & 0x80:
            return n, i


def media_names(raw: bytes) -> dict[str, str]:
    """The apkg's media map: zip member name -> media file name."""
    try:
        m = json.loads(raw.decode("utf-8"))
        if isinstance(m, dict):
            return {str(k): v for k, v in m.items()}
    except (UnicodeDecodeError, ValueError):
        pass
    # new format: MediaEntries { repeated MediaEntry entries = 1 }, MediaEntry { string name = 1; ...;
    # optional uint32 legacy_zip_filename = 255 }; the zip member of entry n is "n" unless legacy_zip_filename is set
    b = unzstd(raw)
    out: dict[str, str] = {}
    i = idx = 0
    while i < len(b):
        tag, i = _varint(b, i)
        if tag & 7 != 2:
            raise ValueError("unexpected media list")
        ln, i = _varint(b, i)
        entry, i = b[i:i + ln], i + ln
        name, member, j = "", str(idx), 0
        while j < len(entry):
            t, j = _varint(entry, j)
            field, wire = t >> 3, t & 7
            if wire == 0:
                v, j = _varint(entry, j)
                if field == 255:
                    member = str(v)
            elif wire == 2:
                ln2, j = _varint(entry, j)
                if field == 1:
                    name = entry[j:j + ln2].decode("utf-8")
                j += ln2
            else:
                raise ValueError("unexpected media entry")
        out[member] = name
        idx += 1
    return out


def densha_version(path: str) -> str | None:
    """The DT_VERSION in the apkg's _densha.js ("" if it has none), or None if the deck has no _densha.js."""
    with zipfile.ZipFile(path) as z:
        names = media_names(z.read("media"))
        member = next((k for k, v in names.items() if v == "_densha.js"), None)
        if member is None:
            return None
        data = z.read(member)
        if data[:4] == b"\x28\xb5\x2f\xfd":     # zstd frame (new format)
            data = unzstd(data)
    m = re.search(r'DT_VERSION\s*=\s*"([^"]*)"', data[:8192].decode("utf-8", "replace"))
    return m.group(1) if m else ""


if __name__ == "__main__":
    v = densha_version(sys.argv[1])
    if v is None:
        sys.exit("no _densha.js in " + sys.argv[1])
    print(v)
