package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	stagingDir := flag.String("staging", "/var/www/staging", "Staging directory for .conf files")
	liveDir := flag.String("live", "/etc/httpd/conf.d", "Live Apache config directory")
	rejectDir := flag.String("reject", "/var/www/rejected", "Rejected config directory")
	pidFile := flag.String("pidfile", "/var/run/httpd.pid", "Apache PID file")
	pollInterval := flag.Duration("interval", 5*time.Second, "Poll interval")
	apacheBinary := flag.String("apache", "apachectl", "Apache binary for -t (apachectl or httpd)")
	flag.Parse()

	// Ensure directories exist (create staging/reject if needed; live may already exist)
	for _, dir := range []string{*stagingDir, *rejectDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			fmt.Fprintf(os.Stderr, "Cannot create directory %s: %v\n", dir, err)
			os.Exit(1)
		}
	}

	validator := NewApacheValidator(*apacheBinary)
	ticker := time.NewTicker(*pollInterval)
	defer ticker.Stop()

	a := &Automator{
		StagingDir: *stagingDir,
		LiveDir:    *liveDir,
		RejectDir:  *rejectDir,
		PidFile:    *pidFile,
		Ticker:     ticker,
		Validator:  validator,
		Log:        func(s string) { fmt.Println(s) },
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		cancel()
	}()

	a.Run(ctx)
}
