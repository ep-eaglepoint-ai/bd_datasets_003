"""
Thread-level suspend/resume using ctypes and Windows API only.
REQ-02: Uses ctypes.windll.kernel32 (no psutil for suspension).
REQ-03: CreateToolhelp32Snapshot, Thread32First, Thread32Next.
REQ-04: Every OpenThread handle closed via CloseHandle.
REQ-07: SeDebugPrivilege enabled via OpenProcessToken/AdjustTokenPrivileges.
REQ-08: ResumeThread loop implemented.
REQ-10: THREADENTRY32 defined with correct ctypes field types and packing.
REQ-11: SuspendThread failure (-1) logged, no crash.
"""

import sys
import logging

if sys.platform != "win32":
    raise RuntimeError("WinFocusKeeper suspension module is Windows-only")

from ctypes import (
    Structure,
    byref,
    sizeof as ctypes_sizeof,
    c_ulong,
    c_void_p,
    windll,
)
from ctypes.wintypes import DWORD, LONG, HANDLE

# ---------------------------------------------------------------------------
# REQ-10: Correct ctypes structures for Windows ABI
# THREADENTRY32: dwSize, cntUsage, th32ThreadID, th32OwnerProcessID,
#               tpBasePri, tpDeltaPri, dwFlags
# ---------------------------------------------------------------------------
class THREADENTRY32(Structure):
    _pack_ = 4
    _fields_ = [
        ("dwSize", DWORD),
        ("cntUsage", DWORD),
        ("th32ThreadID", DWORD),
        ("th32OwnerProcessID", DWORD),
        ("tpBasePri", LONG),
        ("tpDeltaPri", LONG),
        ("dwFlags", DWORD),
    ]


# Optional: PROCESSENTRY32 for process enumeration (correct layout if needed)
class PROCESSENTRY32(Structure):
    _pack_ = 4
    _fields_ = [
        ("dwSize", DWORD),
        ("cntUsage", DWORD),
        ("th32ProcessID", DWORD),
        ("th32DefaultHeapID", c_ulong),
        ("th32ModuleID", DWORD),
        ("cntThreads", DWORD),
        ("th32ParentProcessID", DWORD),
        ("pcPriClassBase", LONG),
        ("dwFlags", DWORD),
        ("szExeFile", (c_ulong * 260)),  # MAX_PATH; type placeholder for ABI
    ]


logger = logging.getLogger(__name__)

kernel32 = windll.kernel32
advapi32 = windll.advapi32

# Constants
TH32CS_SNAPTHREAD = 0x00000004
THREAD_SUSPEND_RESUME = 0x0002
TOKEN_ADJUST_PRIVILEGES = 0x0020
TOKEN_QUERY = 0x0008
SE_PRIVILEGE_ENABLED = 0x00000002
INVALID_HANDLE_VALUE = c_void_p(-1).value  # -1 as handle

# SuspendThread returns (DWORD)-1 on failure
SUSPEND_THREAD_FAILED = 0xFFFFFFFF


class LUID(Structure):
    _fields_ = [("LowPart", DWORD), ("HighPart", LONG)]


class LUID_AND_ATTRIBUTES(Structure):
    _fields_ = [("Luid", LUID), ("Attributes", DWORD)]


class TOKEN_PRIVILEGES(Structure):
    _fields_ = [
        ("PrivilegeCount", DWORD),
        ("Privileges", LUID_AND_ATTRIBUTES * 1),
    ]


def enable_se_debug_privilege():
    """REQ-07: Attempt to enable SeDebugPrivilege in the current process token."""
    token = HANDLE()
    if not advapi32.OpenProcessToken(
        kernel32.GetCurrentProcess(),
        TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
        byref(token),
    ):
        logger.warning("OpenProcessToken failed; cannot enable SeDebugPrivilege")
        return False
    try:
        luid = LUID()
        if not advapi32.LookupPrivilegeValueW(
            None, "SeDebugPrivilege", byref(luid)
        ):
            logger.warning("LookupPrivilegeValueW(SeDebugPrivilege) failed")
            return False
        tp = TOKEN_PRIVILEGES()
        tp.PrivilegeCount = 1
        tp.Privileges[0].Luid = luid
        tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED
        if not advapi32.AdjustTokenPrivileges(
            token, False, byref(tp), 0, None, None
        ):
            logger.warning("AdjustTokenPrivileges failed")
            return False
        return True
    finally:
        kernel32.CloseHandle(token)


def _get_thread_ids_for_process(pid: int):
    """REQ-03: Use CreateToolhelp32Snapshot and Thread32First/Thread32Next."""
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
    if snapshot is None or snapshot == INVALID_HANDLE_VALUE:
        logger.error("CreateToolhelp32Snapshot failed")
        return []
    try:
        te = THREADENTRY32()
        te.dwSize = ctypes_sizeof(THREADENTRY32)
        if not kernel32.Thread32First(snapshot, byref(te)):
            return []
        thread_ids = []
        while True:
            if te.th32OwnerProcessID == pid:
                thread_ids.append(te.th32ThreadID)
            if not kernel32.Thread32Next(snapshot, byref(te)):
                break
        return thread_ids
    finally:
        kernel32.CloseHandle(snapshot)


def suspend_process_threads(pid: int) -> int:
    """
    Suspend all threads belonging to process pid.
    REQ-04: Every OpenThread handle is closed via CloseHandle.
    REQ-11: If SuspendThread returns -1, log and do not crash.
    Returns count of threads successfully suspended.
    """
    thread_ids = _get_thread_ids_for_process(pid)
    suspended = 0
    for tid in thread_ids:
        # THREAD_SUSPEND_RESUME access
        h = kernel32.OpenThread(THREAD_SUSPEND_RESUME, False, tid)
        if h is None or h == 0:
            logger.debug("OpenThread failed for tid %s (AccessDenied or invalid)", tid)
            continue
        try:
            prev_count = kernel32.SuspendThread(h)
            # REQ-11: SuspendThread returns (DWORD)-1 on failure
            if prev_count == SUSPEND_THREAD_FAILED or (c_ulong(prev_count).value == 0xFFFFFFFF):
                logger.warning("SuspendThread failed for thread %s (returned -1)", tid)
                continue
            suspended += 1
        finally:
            kernel32.CloseHandle(h)
    return suspended


def resume_process_threads(pid: int) -> int:
    """
    REQ-08: Resume all threads belonging to process pid (mirror of suspend loop).
    Returns count of threads successfully resumed.
    """
    thread_ids = _get_thread_ids_for_process(pid)
    resumed = 0
    for tid in thread_ids:
        h = kernel32.OpenThread(THREAD_SUSPEND_RESUME, False, tid)
        if h is None or h == 0:
            continue
        try:
            kernel32.ResumeThread(h)
            resumed += 1
        finally:
            kernel32.CloseHandle(h)
    return resumed
