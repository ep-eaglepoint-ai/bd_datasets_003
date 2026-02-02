# WinFocusKeeper: Corporate compliance agent for Windows 11 Enterprise workstations.
# Enforces usage quotas on non-work applications via thread-level suspend (Freeze-in-Place).

from winfocuskeeper.suspension import (
    enable_se_debug_privilege,
    suspend_process_threads,
    resume_process_threads,
)
from winfocuskeeper.focus_tracker import get_foreground_process_id, FocusTracker

__all__ = [
    "enable_se_debug_privilege",
    "suspend_process_threads",
    "resume_process_threads",
    "get_foreground_process_id",
    "FocusTracker",
]
