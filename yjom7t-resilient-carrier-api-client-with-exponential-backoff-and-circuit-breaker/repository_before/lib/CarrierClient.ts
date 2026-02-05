import http from 'http';
import https from 'https';
# http/https: Standard Node.js modules for making network requests.
# These modules provide the raw request capabilities that must be wrapped.

/**
 * @interface RequestOptions
 * Configuration for the outbound carrier request.
 */
interface RequestOptions {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
  timeout: number;
}

/**
 * @interface ResilienceConfig
 * Parameters for the retry and circuit breaker logic.
 */
interface ResilienceConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  failureThreshold: number; // Number of failures before tripping circuit
  resetTimeoutMs: number;   // Time before attempting to close the circuit
}

export class CarrierClient {
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime?: number;

  constructor(private config: ResilienceConfig) {}

  /**
   * Executes a request with the resilience strategy.
   * This is the primary method that needs to be refactored.
   */
  async execute(options: RequestOptions): Promise<any> {
    // TODO: Implement the Circuit Breaker check here.
    // TODO: Implement the Retry loop with Exponential Backoff + Jitter.
    return this.performRequest(options);
  }

  /**
   * The raw underlying request logic.
   * This method should be called by the resilience wrapper.
   */
  private async performRequest(options: RequestOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = options.url.startsWith('https') ? https : http;
      const req = client.request(options.url, { 
        method: options.method, 
        timeout: options.timeout 
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}
