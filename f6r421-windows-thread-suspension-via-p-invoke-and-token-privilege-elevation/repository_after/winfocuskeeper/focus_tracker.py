"""
Active focus tracking using GetForegroundWindow and GetWindowThreadProcessId.
REQ-06: Must use GetForegroundWindow to find the active PID.
REQ-09: UWP/Modern app handling - GetWindowThreadProcessId for foreground window
        (ApplicationFrameHost awareness: same API returns frame host PID when
         appropriate; caller can resolve to app PID if needed).
"""

import sys
import time
import logging
from ctypes import byref, windll
from ctypes.wintypes import DWORD

if sys.platform != "win32":
    raise RuntimeError("WinFocusKeeper focus_tracker is Windows-only")

user32 = windll.user32
logger = logging.getLogger(__name__)


def get_foreground_process_id() -> int | None:
    """
    REQ-06: Use GetForegroundWindow and GetWindowThreadProcessId to determine
    the process ID of the window that currently has focus.
    REQ-09: GetWindowThreadProcessId returns the PID of the window's process
    (for UWP/Electron this may be ApplicationFrameHost or the host process).
    """
    hwnd = user32.GetForegroundWindow()
    if hwnd is None or hwnd == 0:
        return None
    pid = DWORD()
    user32.GetWindowThreadProcessId(hwnd, byref(pid))
    return pid.value


class FocusTracker:
    """
    Tracks active focus time per PID. When quota is exceeded, calls suspend
    and optional notification (message box or toast).
    """

    def __init__(self, quota_seconds: float, on_quota_exceeded=None):
        self.quota_seconds = quota_seconds
        self.on_quota_exceeded = on_quota_exceeded or (lambda pid: None)
        self._accumulated: dict[int, float] = {}
        self._last_pid: int | None = None
        self._last_time: float = 0.0
        self._suspended_pids: set[int] = set()

    def tick(self) -> int | None:
        """Poll once; accumulate time for current foreground PID. Returns current PID."""
        pid = get_foreground_process_id()
        now = time.monotonic()
        if pid is not None and pid > 0:
            if self._last_pid == pid and self._last_time > 0:
                delta = now - self._last_time
                self._accumulated[pid] = self._accumulated.get(pid, 0) + delta
                if self._accumulated[pid] >= self.quota_seconds and pid not in self._suspended_pids:
                    self.on_quota_exceeded(pid)
                    self._suspended_pids.add(pid)
            self._last_pid = pid
        self._last_time = now
        return pid
