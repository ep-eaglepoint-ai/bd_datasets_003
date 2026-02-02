"""
WinFocusKeeper service entry point.
Runs focus tracking and enforces quotas; on quota exceeded suspends threads
and shows notification. No zombie threads: atexit and SIGABRT handler resume
any suspended PIDs so threads are not left suspended if the service crashes.
"""

import atexit
import logging
import signal
import sys

if sys.platform != "win32":
    sys.exit("WinFocusKeeper is Windows-only.")

from winfocuskeeper import (
    enable_se_debug_privilege,
    suspend_process_threads,
    resume_process_threads,
    get_foreground_process_id,
    FocusTracker,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Track PIDs we suspended so we can resume on exit (no zombie threads)
_suspended_pids: set[int] = set()
_abort_handler_installed: bool = False


def _on_quota_exceeded(pid: int):
    """Suspend process threads and show notification."""
    _suspended_pids.add(pid)
    n = suspend_process_threads(pid)
    logger.info("Quota exceeded for PID %s: suspended %s threads", pid, n)
    try:
        # System-modal message box when limit reached
        from ctypes import windll
        windll.user32.MessageBoxW(
            None,
            "Usage limit reached. Application has been paused.",
            "WinFocusKeeper",
            0x40,  # MB_ICONINFORMATION
        )
    except Exception as e:
        logger.warning("Notification failed: %s", e)


def _resume_all_on_exit():
    """Resume any threads we suspended so no zombie threads remain."""
    for pid in list(_suspended_pids):
        try:
            resume_process_threads(pid)
            logger.info("Resumed threads for PID %s on exit", pid)
        except Exception as e:
            logger.warning("Resume on exit failed for PID %s: %s", pid, e)
    _suspended_pids.clear()


def _install_abort_handler():
    """Install SIGABRT handler to resume threads on abort (no zombie threads on crash)."""
    global _abort_handler_installed
    if _abort_handler_installed:
        return
    _abort_handler_installed = True
    old_handler = [None]

    def _on_abort(signum, frame):
        logger.warning("SIGABRT received; resuming suspended threads before exit")
        _resume_all_on_exit()
        if old_handler[0] is not None and callable(old_handler[0]):
            old_handler[0](signum, frame)
        else:
            raise SystemExit(1)

    try:
        old_handler[0] = signal.signal(signal.SIGABRT, _on_abort)
    except (ValueError, OSError):
        _abort_handler_installed = False


def main():
    if not enable_se_debug_privilege():
        logger.warning("SeDebugPrivilege not enabled; may get AccessDenied for some processes")
    atexit.register(_resume_all_on_exit)
    _install_abort_handler()
    # Example: 60 second quota for demo; configurable in production
    quota_seconds = 60.0
    tracker = FocusTracker(quota_seconds, on_quota_exceeded=_on_quota_exceeded)
    logger.info("WinFocusKeeper started; quota=%s seconds", quota_seconds)
    try:
        while True:
            tracker.tick()
            import time
            time.sleep(0.5)
    except KeyboardInterrupt:
        logger.info("WinFocusKeeper stopped")


if __name__ == "__main__":
    main()
