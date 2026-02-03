package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// SendReload reads the PID from pidFile and sends SIGHUP to that process.
// If the process does not exist (stale PID file), it logs and returns without error (daemon must not crash).
func SendReload(pidFile string, log func(string)) error {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return err
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	if err := proc.Signal(syscall.SIGHUP); err != nil {
		// Stale PID or process not running: log and continue, do not crash
		if log != nil {
			log(fmt.Sprintf("Apache not running (stale PID file): %v", err))
		}
		return nil
	}
	if log != nil {
		log(fmt.Sprintf("Reload signal sent to PID %d", pid))
	}
	return nil
}
