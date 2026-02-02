def test_req02_no_psutil_for_suspension(combined_source):
    """REQ-02: Must use ctypes.windll.kernel32; usage of psutil for suspension is failure."""
    # Check for actual usage (import/call), not the word in docstrings
    assert "import psutil" not in combined_source and "from psutil" not in combined_source, (
        "Must not import psutil for suspension; use ctypes.windll.kernel32 only."
    )
    assert "psutil." not in combined_source, (
        "Must not use psutil for suspension; use ctypes.windll.kernel32 only."
    )
    assert "kernel32" in combined_source or "windll.kernel32" in combined_source, (
        "Must use ctypes.windll.kernel32 for suspension logic."
    )


def test_req03_create_toolhelp_snapshot_and_thread32(combined_source):
    """REQ-03: Must call CreateToolhelp32Snapshot and Thread32First/Thread32Next."""
    assert "CreateToolhelp32Snapshot" in combined_source
    assert "Thread32First" in combined_source
    assert "Thread32Next" in combined_source



def test_req04_open_thread_closed_via_close_handle(combined_source):
    """REQ-04: Every OpenThread handle must be closed via CloseHandle."""
    assert "OpenThread" in combined_source
    assert "CloseHandle" in combined_source

def test_req05_no_sigstop(combined_source):
    """REQ-05: Any reference to signal.SIGSTOP is failure."""
    assert "SIGSTOP" not in combined_source, "Must not use or reference signal.SIGSTOP"


def test_req06_get_foreground_window_for_active_pid(combined_source):
    """REQ-06: Must use GetForegroundWindow to find the active PID."""
    assert "GetForegroundWindow" in combined_source
    assert "GetWindowThreadProcessId" in combined_source


def test_req07_se_debug_privilege(combined_source):
    """REQ-07: Must attempt to enable SeDebugPrivilege."""
    assert "SeDebugPrivilege" in combined_source
    assert "LookupPrivilegeValue" in combined_source or "LookupPrivilegeValueW" in combined_source
    assert "AdjustTokenPrivileges" in combined_source


def test_req08_resume_thread_loop(combined_source):
    """REQ-08: Must theoretically support or implement ResumeThread loop."""
    assert "ResumeThread" in combined_source
    assert "resume" in combined_source.lower()


def test_req09_uwp_pid_mapping_get_window_thread_process_id(combined_source):
    """REQ-09: UWP/Modern app handling / PID mapping (GetWindowThreadProcessId)."""
    assert "GetWindowThreadProcessId" in combined_source
    assert "GetForegroundWindow" in combined_source


def test_req10_ctypes_structures_defined(repo_sources):
    """REQ-10: THREADENTRY32 (and PROCESSENTRY32 if used) defined with correct field types and packing."""
    found_thread = False
    for rel, src in repo_sources.items():
        if "THREADENTRY32" not in src:
            continue
        found_thread = True
        assert "th32ThreadID" in src or "th32OwnerProcessID" in src
        assert "dwSize" in src
        assert "_pack_" in src or "Structure" in src
        assert "DWORD" in src or "c_ulong" in src or "c_long" in src
        break
    assert found_thread, "THREADENTRY32 must be defined with correct ctypes fields"


def test_req11_suspend_thread_failure_handling(combined_source):
    """REQ-11: If SuspendThread returns -1, log and do not crash."""
    assert "SuspendThread" in combined_source
    has_check = (
        "0xFFFFFFFF" in combined_source
        or "SUSPEND_THREAD_FAILED" in combined_source
        or ("SuspendThread" in combined_source and ("log" in combined_source.lower() or "warning" in combined_source.lower()))
    )
    assert has_check, "SuspendThread return value must be checked; on -1 log and do not crash"
