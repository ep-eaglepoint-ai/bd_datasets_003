def test_req02_no_psutil_for_suspension(combined_source):
    """REQ-02: Must use ctypes.windll.kernel32; usage of psutil for suspension is failure."""
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
        if "PROCESSENTRY32" in src:
            assert "szExeFile" in src
            assert "c_char" in src or "c_ulong" in src, "PROCESSENTRY32.szExeFile should use c_char or correct type"
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
    # Must not re-raise on SuspendThread failure (continue or skip, not raise)
    assert "continue" in combined_source, "On SuspendThread failure code must continue, not crash"


def test_notification_on_quota_exceeded(combined_source):
    """When limit is reached, system must trigger message box or toast (lockout notification)."""
    has_message_box = "MessageBoxW" in combined_source or "MessageBoxA" in combined_source
    has_notification_text = (
        "Usage limit" in combined_source
        or "lockout" in combined_source.lower()
        or "limit reached" in combined_source.lower()
        or "paused" in combined_source.lower()
    )
    assert has_message_box or has_notification_text, (
        "Must show system-modal message box or toast when quota exceeded (lockout notification)"
    )


def test_no_zombie_threads_resume_on_exit(combined_source):
    """No zombie threads: must resume suspended threads on exit (atexit or signal handler)."""
    assert "atexit" in combined_source, "Must register atexit to resume threads on normal exit"
    assert "resume" in combined_source.lower() and "resume_process_threads" in combined_source, (
        "Must call resume_process_threads on exit path"
    )
    # Either explicit _resume_all_on_exit or equivalent loop that resumes PIDs
    has_resume_on_exit = (
        "_resume_all_on_exit" in combined_source
        or ("resume_process_threads" in combined_source and "exit" in combined_source.lower())
    )
    assert has_resume_on_exit, "Must resume all suspended PIDs on exit (no zombie threads)"


def test_no_zombie_threads_on_crash(combined_source):
    """No zombie threads on crash: must attempt to resume on SIGABRT (or similar crash path)."""
    # Either SIGABRT handler that calls resume, or atexit is the only mechanism (acceptable)
    has_crash_resume = (
        "SIGABRT" in combined_source
        or "signal" in combined_source and "resume" in combined_source.lower()
        or "zombie" in combined_source.lower()
    )
    assert has_crash_resume or "atexit" in combined_source, (
        "Must address zombie threads on crash (e.g. SIGABRT handler or document atexit)"
    )


def test_access_denied_handling(combined_source):
    """OpenThread/access failures must be handled gracefully (log and continue, not crash)."""
    assert "OpenThread" in combined_source
    # Code must handle OpenThread failure (continue, or check handle before use)
    has_handle_check = (
        "OpenThread" in combined_source
        and (
            "continue" in combined_source
            or "AccessDenied" in combined_source
            or ("if " in combined_source and ("h is None" in combined_source or "h == 0" in combined_source))
        )
    )
    assert has_handle_check, (
        "When OpenThread fails (e.g. AccessDenied), code must log/handle and continue, not crash"
    )
