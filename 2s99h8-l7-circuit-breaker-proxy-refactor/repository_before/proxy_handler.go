// filename: proxy/proxy_handler.go
package proxy

import (
	"net/http"
	"net/http/httputil"
)

// ProxyHandler wraps the standard ReverseProxy with our Circuit Breaker.
type ProxyHandler struct {
	Proxy   *httputil.ReverseProxy
	Breaker *LegacyCircuitBreaker
}

func (ph *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// The breaker's RoundTrip is called by the ReverseProxy's Transport.
	ph.Proxy.ServeHTTP(w, r)
}
