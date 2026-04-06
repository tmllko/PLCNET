"""
PLC Connection Class
=====================
Wraps pymcprotocol.Type3E with:
  - Auto-reconnect on read/write failure
  - Proper socket teardown before each reconnect attempt
  - Thread-safe locking
  - Graceful fallback if pymcprotocol is not installed

FIX: Cable re-insert detection
  When a cable is unplugged, the socket enters a broken state.
  On the next poll cycle _connect() now calls _close() first to
  discard the stale socket and create a brand-new Type3E object,
  so reconnection works reliably after cable re-insertion.
"""

import threading

try:
    import pymcprotocol
    MC_OK = True
except ImportError:
    MC_OK = False
    print("❌ pymcprotocol not found — run: pip install pymcprotocol")


class PLCConnection:
    """Thread-safe Mitsubishi MC-Protocol Type 3E connection."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.plc = None
        self.connected = False
        self.last_err: str | None = None
        self._lock = threading.Lock()

    # ── Socket lifecycle ──────────────────────────────────────────────────

    def _close(self):
        """
        Silently tear down the existing socket.

        Called before every reconnect attempt so stale sockets from
        a previous cable-unplug event are fully discarded first.
        """
        if self.plc is not None:
            try:
                self.plc.close()
            except Exception:
                pass          # ignore — socket may already be dead
            finally:
                self.plc = None
        self.connected = False

    def _connect(self) -> bool:
        """
        (Re-)establish a connection.

        Always destroys the old socket first so cable re-insertion
        is correctly detected on the next poll cycle.
        Returns True on success.
        """
        if not MC_OK:
            self.last_err = "pymcprotocol not installed"
            return False

        self._close()           # ← key fix: discard stale socket

        try:
            self.plc = pymcprotocol.Type3E()
            self.plc.setaccessopt(commtype="binary")
            self.plc.connect(self.cfg["ip"], self.cfg["port"])
            self.connected = True
            self.last_err = None
            return True
        except Exception as exc:
            self.last_err = str(exc)
            self.plc = None     # ensure no partial object lingers
            self.connected = False
            return False

    def _ensure_connected(self):
        """Connect if not already connected."""
        if not self.connected:
            self._connect()

    def _handle_error(self, exc: Exception):
        """
        Called after any read/write exception.
        Closes the socket immediately so the next poll cycle gets
        a clean reconnect attempt (critical for cable re-insertion).
        """
        self.last_err = str(exc)
        self._close()           # ← force teardown — next poll will reconnect

    # ── Public read / write API ───────────────────────────────────────────

    def read_words(self, device: str, count: int = 1):
        """Read `count` word registers starting at `device` (e.g. 'D0')."""
        with self._lock:
            self._ensure_connected()
            if not self.connected:
                return None
            try:
                return self.plc.batchread_wordunits(headdevice=device, readsize=count)
            except Exception as exc:
                self._handle_error(exc)
                return None

    def read_bits(self, device: str, count: int = 1):
        """Read `count` bit registers starting at `device` (e.g. 'X0')."""
        with self._lock:
            self._ensure_connected()
            if not self.connected:
                return None
            try:
                return self.plc.batchread_bitunits(headdevice=device, readsize=count)
            except Exception as exc:
                self._handle_error(exc)
                return None

    def write_words(self, device: str, values: list) -> bool:
        """Write a list of word values starting at `device`."""
        with self._lock:
            self._ensure_connected()
            if not self.connected:
                return False
            try:
                self.plc.batchwrite_wordunits(headdevice=device, values=values)
                return True
            except Exception as exc:
                self._handle_error(exc)
                return False

    def write_bits(self, device: str, values: list) -> bool:
        """Write a list of bit values starting at `device`."""
        with self._lock:
            self._ensure_connected()
            if not self.connected:
                return False
            try:
                self.plc.batchwrite_bitunits(headdevice=device, values=values)
                return True
            except Exception as exc:
                self._handle_error(exc)
                return False

    def __repr__(self):
        status = "CONNECTED" if self.connected else f"OFFLINE ({self.last_err})"
        return f"<PLCConnection {self.cfg['name']} {self.cfg['ip']} — {status}>"
