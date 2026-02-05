package main

import (
	"context"
	"os/exec"
)

// Validator validates an Apache config file (e.g. dry-run syntax check).
type Validator interface {
	Validate(ctx context.Context, configPath string) error
}

// ApacheValidator runs apachectl -t -f <file> (or httpd -t -f <file>).
type ApacheValidator struct {
	Binary string // "apachectl" or "httpd"
}

// NewApacheValidator returns a validator using the given binary name.
func NewApacheValidator(binary string) *ApacheValidator {
	if binary == "" {
		binary = "apachectl"
	}
	return &ApacheValidator{Binary: binary}
}

// Validate runs the Apache syntax check against the config file.
func (v *ApacheValidator) Validate(ctx context.Context, configPath string) error {
	cmd := exec.CommandContext(ctx, v.Binary, "-t", "-f", configPath)
	return cmd.Run()
}
