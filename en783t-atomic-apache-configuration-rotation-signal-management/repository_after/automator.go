package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Automator is the config deployment daemon.
type Automator struct {
	StagingDir string
	LiveDir    string
	RejectDir  string
	PidFile    string
	Ticker     *time.Ticker
	Validator  Validator
	Log        func(string) // stdout status messages
}

// Run starts the daemon loop: each tick, scan staging and process .conf files.
func (a *Automator) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-a.Ticker.C:
			a.scanStaging(ctx)
		}
	}
}

// scanStaging lists staging, processes each .conf file (validate -> move -> reload).
func (a *Automator) scanStaging(ctx context.Context) {
	entries, err := os.ReadDir(a.StagingDir)
	if err != nil {
		if a.Log != nil {
			a.Log(fmt.Sprintf("Cannot read staging dir: %v", err))
		}
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if filepath.Ext(e.Name()) != ".conf" {
			continue
		}
		stagingPath := filepath.Join(a.StagingDir, e.Name())
		a.processOne(ctx, stagingPath, e.Name())
	}
}

func (a *Automator) processOne(ctx context.Context, stagingPath, name string) {
	// 1. Dry-run validation
	if err := a.Validator.Validate(ctx, stagingPath); err != nil {
		rejectPath := filepath.Join(a.RejectDir, name)
		if moveErr := MoveToRejected(stagingPath, rejectPath); moveErr != nil {
			if a.Log != nil {
				a.Log(fmt.Sprintf("Syntax check failed, could not move to rejected: %v", moveErr))
			}
			return
		}
		if a.Log != nil {
			a.Log("Syntax check failed, moved to rejected")
		}
		return
	}
	// 2. Atomic move to live
	livePath := filepath.Join(a.LiveDir, name)
	if err := MoveToLive(stagingPath, livePath); err != nil {
		if a.Log != nil {
			a.Log(fmt.Sprintf("Could not move to live: %v", err))
		}
		return
	}
	if a.Log != nil {
		a.Log(fmt.Sprintf("Valid config applied: %s", name))
	}
	// 3. Graceful reload: read PID and send SIGHUP
	SendReload(a.PidFile, a.Log)
}
