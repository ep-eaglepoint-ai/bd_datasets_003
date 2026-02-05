// filename: proxy/proxy_handler.go
package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
)

// ProxyHandler wraps the standard ReverseProxy with our optimized Circuit Breaker.
type ProxyHandler struct {
	Proxy   *httputil.ReverseProxy
	Breaker *FastCircuitBreaker
}

// NewProxyHandler creates a new proxy handler with circuit breaker
func NewProxyHandler(targetURL string, breaker *FastCircuitBreaker) (*ProxyHandler, error) {
	target, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}
	
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// Inject the circuit breaker as the transport
	proxy.Transport = &CircuitBreakerTransport{
		Breaker: breaker,
		Base:    http.DefaultTransport,
	}
	
	return &ProxyHandler{
		Proxy:   proxy,
		Breaker: breaker,
	}, nil
}

// ServeHTTP handles incoming HTTP requests with circuit breaking
func (ph *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// The circuit breaker is integrated into the proxy's transport
	// so it will automatically handle circuit breaking logic
	ph.Proxy.ServeHTTP(w, r)
}

// CircuitBreakerTransport wraps an http.RoundTripper with circuit breaking
type CircuitBreakerTransport struct {
	Breaker *FastCircuitBreaker
	Base    http.RoundTripper
}

// RoundTrip implements http.RoundTripper interface
func (cbt *CircuitBreakerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Use the circuit breaker's RoundTrip method directly
	resp, err := cbt.Breaker.RoundTrip(req)
	
	// If circuit breaker returns ErrCircuitOpen, we should return the 503 response
	// but not the error, so the proxy doesn't treat it as a transport error
	if err == ErrCircuitOpen && resp != nil && resp.StatusCode == http.StatusServiceUnavailable {
		return resp, nil // Return the 503 response without error
	}
	
	return resp, err
}