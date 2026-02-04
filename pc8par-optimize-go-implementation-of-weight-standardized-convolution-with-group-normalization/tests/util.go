package main

import (
	"os"
	"strings"
)

func getRepoPath() string {
	if env := os.Getenv("REPO_PATH"); env != "" {
		// Strip Windows Git Bash path conversion (e.g., "C:/Program Files/Git/app/..." -> "/app/...")
		if strings.HasPrefix(env, "C:/Program Files/Git/") {
			return strings.TrimPrefix(env, "C:/Program Files/Git")
		}
		// Also handle other Windows drive letters
		if len(env) > 2 && env[1] == ':' {
			// Convert C:/... to /c/... or just strip if it's a Git Bash conversion
			if idx := strings.Index(env, "/app/"); idx >= 0 {
				return env[idx:]
			}
		}
		return env
	}
	return "/app/repository_after"
}

func usingAfter() bool {
	p := getRepoPath()
	return strings.Contains(strings.ToLower(p), "repository_after")
}
