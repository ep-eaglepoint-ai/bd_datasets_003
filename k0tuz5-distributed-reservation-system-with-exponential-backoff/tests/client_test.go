package tests

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func buildClientBinary(t *testing.T) string {
	t.Helper()
	clientExe, err := resolveOrBuildClient("client_"+TestTarget, RepoPath)
	if err != nil {
		t.Fatalf("failed to build client binary: %v", err)
	}
	return clientExe
}

func TestClientScenarios(t *testing.T) {
	scenarios := []struct {
		name       string
		statusFunc func(attempt *int) int
		expectLogs []string
	}{
		{
			name: "successful reservation",
			statusFunc: func(_ *int) int {
				return http.StatusOK
			},
			expectLogs: []string{"reservation successful"},
		},
		{
			name: "stock exhausted",
			statusFunc: func(_ *int) int {
				return http.StatusConflict
			},
			expectLogs: []string{"stock exhausted"},
		},
		{
			name: "retryable error with backoff",
			statusFunc: func(attempt *int) int {
				*attempt++
				if *attempt < 3 {
					return http.StatusTooManyRequests
				}
				return http.StatusOK
			},
			expectLogs: []string{"reservation successful"},
		},
		{
			name: "connection error handling",
			statusFunc: func(_ *int) int {
				return 0
			},
			expectLogs: []string{"connection error"},
		},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			var serverURL string
			attempt := 0

			if sc.name != "connection error handling" {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					status := sc.statusFunc(&attempt)
					w.WriteHeader(status)
				}))
				defer server.Close()
				serverURL = server.URL
			} else {
				// point to a non-listening port to simulate connection error
				serverURL = "http://localhost:12345"
			}

			clientExe := buildClientBinary(t)
			cmd := exec.Command(clientExe)
			cmd.Env = append(os.Environ(), "SERVER_URL="+serverURL)

			out, err := cmd.CombinedOutput()
			output := string(out)

			// for retryable scenario, we don't fail on cmd err if backoff completed successfully
			if sc.name != "retryable error with backoff" && err != nil {
				t.Fatalf("client failed: %v\nOutput:\n%s", err, output)
			}

			for _, expected := range sc.expectLogs {
				if !strings.Contains(output, expected) {
					t.Errorf("expected log %q not found in output:\n%s", expected, output)
				}
			}
		})
	}
}
