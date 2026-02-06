<template>
  <div class="dashboard">
    <header class="header">
      <h1>Circuit Breaker Dashboard</h1>
      <p>Advanced resilience pattern demo in Nuxt 3</p>
    </header>

    <main class="main">
      <!-- Service Selection -->
      <section class="panel service-panel">
        <h2>Service Selection</h2>
        <div class="service-buttons">
          <button
            v-for="service in services"
            :key="service.key"
            :class="['service-btn', { active: selectedService === service.key }]"
            @click="selectService(service.key)"
          >
            <span class="service-name">{{ service.name }}</span>
            <span class="service-desc">{{ service.description }}</span>
          </button>
        </div>
      </section>

      <!-- Current State -->
      <section class="panel state-panel">
        <h2>Breaker State: {{ selectedServiceKey }}</h2>
        <div v-if="currentStatus" class="state-display">
          <div :class="['state-badge', currentStatus.state.toLowerCase()]">
            {{ currentStatus.state }}
          </div>
          <div class="metrics-grid">
            <div class="metric">
              <span class="metric-value">{{ currentStatus.metrics.totalSuccesses }}</span>
              <span class="metric-label">Successes</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ currentStatus.metrics.totalFailures }}</span>
              <span class="metric-label">Failures</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ currentStatus.metrics.totalTimeouts }}</span>
              <span class="metric-label">Timeouts</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ currentStatus.metrics.totalRejects }}</span>
              <span class="metric-label">Rejects</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ currentStatus.metrics.failureRate.toFixed(1) }}%</span>
              <span class="metric-label">Failure Rate</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ currentStatus.currentInFlight }}</span>
              <span class="metric-label">In-Flight</span>
            </div>
          </div>
        </div>
        <div v-else class="no-data">
          No data yet. Make some requests to see metrics.
        </div>
      </section>

      <!-- Configuration -->
      <section class="panel config-panel">
        <h2>Configuration</h2>
        <div class="config-grid">
          <div class="config-item">
            <label>Failure Threshold</label>
            <input v-model.number="config.failureThreshold" type="number" min="1" max="100" />
          </div>
          <div class="config-item">
            <label>Reset Timeout (ms)</label>
            <input v-model.number="config.resetTimeout" type="number" min="1000" max="300000" />
          </div>
          <div class="config-item">
            <label>Success Threshold</label>
            <input v-model.number="config.successThreshold" type="number" min="1" max="50" />
          </div>
          <div class="config-item">
            <label>Request Timeout (ms)</label>
            <input v-model.number="config.timeout" type="number" min="100" max="60000" />
          </div>
          <div class="config-item">
            <label>Bulkhead Limit</label>
            <input v-model.number="config.bulkheadLimit" type="number" min="1" max="100" />
          </div>
          <div class="config-item">
            <label>Min Request Volume</label>
            <input v-model.number="config.minimumRequestVolume" type="number" min="1" max="100" />
          </div>
          <div class="config-item">
            <label>Failure Rate Threshold (%)</label>
            <input v-model.number="config.failureRateThreshold" type="number" min="1" max="100" />
          </div>
          <div class="config-item">
            <label>Half-Open Probe Limit</label>
            <input v-model.number="config.halfOpenProbeLimit" type="number" min="1" max="20" />
          </div>
        </div>

        <div class="upstream-config">
          <h3>Upstream Parameters</h3>
          <div class="config-grid">
            <div class="config-item">
              <label>Delay (ms)</label>
              <input v-model.number="upstreamConfig.delay" type="number" min="0" max="30000" />
            </div>
            <div class="config-item">
              <label>Failure Rate (%) - Flaky only</label>
              <input v-model.number="upstreamConfig.failureRate" type="number" min="0" max="100" />
            </div>
          </div>
        </div>
      </section>

      <!-- Actions -->
      <section class="panel actions-panel">
        <h2>Actions</h2>
        <div class="actions-grid">
          <button class="action-btn primary" @click="sendRequest" :disabled="isLoading">
            {{ isLoading ? 'Sending...' : 'Send Request' }}
          </button>
          <button class="action-btn" @click="sendBurst(5)" :disabled="isLoading">
            Burst (5)
          </button>
          <button class="action-btn" @click="sendBurst(10)" :disabled="isLoading">
            Burst (10)
          </button>
          <button class="action-btn" @click="sendBurst(20)" :disabled="isLoading">
            Burst (20)
          </button>
          <button class="action-btn danger" @click="resetBreaker">
            Reset Breaker
          </button>
          <button class="action-btn" @click="refreshStatus">
            Refresh Status
          </button>
        </div>
      </section>

      <!-- Last Response -->
      <section class="panel response-panel">
        <h2>Last Response</h2>
        <div v-if="lastResponse" class="response-display">
          <div class="response-meta">
            <span :class="['response-status', lastResponse.fallbackUsed ? 'fallback' : 'success']">
              {{ lastResponse.fallbackUsed ? 'FALLBACK' : 'SUCCESS' }}
            </span>
            <span class="response-duration">{{ lastResponse.duration }}ms</span>
            <span v-if="lastResponse.fallbackReason" class="response-reason">
              Reason: {{ lastResponse.fallbackReason }}
            </span>
          </div>
          <pre class="response-data">{{ JSON.stringify(lastResponse, null, 2) }}</pre>
        </div>
        <div v-else class="no-data">No responses yet.</div>
      </section>

      <!-- Event Feed -->
      <section class="panel events-panel">
        <h2>Live Event Feed</h2>
        <div class="events-list">
          <div
            v-for="event in events"
            :key="event.timestamp"
            :class="['event-item', event.eventType.toLowerCase()]"
          >
            <span class="event-time">{{ formatTime(event.timestamp) }}</span>
            <span class="event-type">{{ event.eventType }}</span>
            <span class="event-service">{{ event.serviceKey }}</span>
            <span class="event-details">{{ JSON.stringify(event.details) }}</span>
          </div>
          <div v-if="events.length === 0" class="no-data">No events yet.</div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

interface Service {
  key: string;
  name: string;
  description: string;
}

interface BreakerMetrics {
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  totalRejects: number;
  failureRate: number;
  timeoutRate: number;
  totalRequests: number;
}

interface BreakerStatus {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  metrics: BreakerMetrics;
  lastStateChange: number;
  consecutiveSuccesses: number;
  currentInFlight: number;
  probeCount: number;
}

interface BreakerEvent {
  timestamp: number;
  serviceKey: string;
  eventType: string;
  details: Record<string, unknown>;
}

interface ExecutionResult {
  data: unknown;
  stats: BreakerStatus;
  fallbackUsed: boolean;
  fallbackReason?: string;
  duration: number;
  error?: string;
}

const services: Service[] = [
  { key: 'fast', name: 'Fast Service', description: 'Always responds quickly' },
  { key: 'flaky', name: 'Flaky Service', description: 'Random failures' },
  { key: 'slow', name: 'Slow Service', description: 'May timeout' }
];

const selectedService = ref('fast');
const selectedServiceKey = computed(() => `upstream-${selectedService.value}`);

const currentStatus = ref<BreakerStatus | null>(null);
const lastResponse = ref<ExecutionResult | null>(null);
const events = ref<BreakerEvent[]>([]);
const isLoading = ref(false);

const config = reactive({
  failureThreshold: 5,
  resetTimeout: 10000,
  successThreshold: 3,
  timeout: 3000,
  bulkheadLimit: 10,
  minimumRequestVolume: 5,
  failureRateThreshold: 50,
  halfOpenProbeLimit: 3
});

const upstreamConfig = reactive({
  delay: 100,
  failureRate: 50
});

let pollInterval: ReturnType<typeof setInterval> | null = null;

function selectService(key: string) {
  selectedService.value = key;
  refreshStatus();
}

async function sendRequest() {
  isLoading.value = true;
  try {
    const params = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(config).map(([k, v]) => [k, String(v)])
      ),
      delay: String(upstreamConfig.delay),
      failureRate: String(upstreamConfig.failureRate)
    });

    const response = await fetch(`/api/services/${selectedService.value}?${params}`);
    const data = await response.json();
    lastResponse.value = data;
    currentStatus.value = data.stats;
    await refreshEvents();
  } catch (error) {
    console.error('Request failed:', error);
  } finally {
    isLoading.value = false;
  }
}

async function sendBurst(count: number) {
  isLoading.value = true;
  const promises = Array(count).fill(null).map(() => {
    const params = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(config).map(([k, v]) => [k, String(v)])
      ),
      delay: String(upstreamConfig.delay),
      failureRate: String(upstreamConfig.failureRate)
    });
    return fetch(`/api/services/${selectedService.value}?${params}`)
      .then(r => r.json())
      .catch(() => null);
  });

  const results = await Promise.all(promises);
  const lastResult = results.filter(Boolean).pop();
  if (lastResult) {
    lastResponse.value = lastResult;
    currentStatus.value = lastResult.stats;
  }
  await refreshEvents();
  isLoading.value = false;
}

async function resetBreaker() {
  try {
    await fetch('/api/breaker/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceKey: selectedServiceKey.value })
    });
    await refreshStatus();
    await refreshEvents();
  } catch (error) {
    console.error('Reset failed:', error);
  }
}

async function refreshStatus() {
  try {
    const response = await fetch(`/api/breaker/status?serviceKey=${selectedServiceKey.value}`);
    if (response.ok) {
      const data = await response.json();
      currentStatus.value = data.status;
    } else {
      currentStatus.value = null;
    }
  } catch (error) {
    console.error('Status fetch failed:', error);
  }
}

async function refreshEvents() {
  try {
    const response = await fetch(`/api/breaker/events?limit=50&seconds=300`);
    const data = await response.json();
    events.value = data.events.reverse();
  } catch (error) {
    console.error('Events fetch failed:', error);
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

onMounted(() => {
  refreshStatus();
  refreshEvents();
  pollInterval = setInterval(() => {
    refreshStatus();
    refreshEvents();
  }, 2000);
});

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}

.dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  font-size: 2rem;
  color: #f1f5f9;
  margin-bottom: 8px;
}

.header p {
  color: #94a3b8;
}

.main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.panel {
  background: #1e293b;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #334155;
}

.panel h2 {
  font-size: 1.1rem;
  color: #f1f5f9;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #334155;
}

.panel h3 {
  font-size: 0.95rem;
  color: #cbd5e1;
  margin: 16px 0 12px;
}

/* Service Selection */
.service-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.service-btn {
  flex: 1;
  min-width: 120px;
  padding: 12px;
  background: #334155;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.service-btn:hover {
  background: #475569;
}

.service-btn.active {
  border-color: #3b82f6;
  background: #1e3a5f;
}

.service-name {
  display: block;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 4px;
}

.service-desc {
  display: block;
  font-size: 0.8rem;
  color: #94a3b8;
}

/* State Display */
.state-display {
  text-align: center;
}

.state-badge {
  display: inline-block;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 20px;
}

.state-badge.closed {
  background: #166534;
  color: #86efac;
}

.state-badge.open {
  background: #991b1b;
  color: #fca5a5;
}

.state-badge.half_open {
  background: #854d0e;
  color: #fde047;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.metric {
  background: #334155;
  padding: 12px;
  border-radius: 8px;
  text-align: center;
}

.metric-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
}

.metric-label {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 4px;
}

/* Configuration */
.config-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-item label {
  font-size: 0.8rem;
  color: #94a3b8;
}

.config-item input {
  padding: 8px 12px;
  background: #334155;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 0.9rem;
}

.config-item input:focus {
  outline: none;
  border-color: #3b82f6;
}

/* Actions */
.actions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.action-btn {
  padding: 10px 20px;
  background: #334155;
  border: none;
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #475569;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: #2563eb;
}

.action-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.action-btn.danger {
  background: #dc2626;
}

.action-btn.danger:hover:not(:disabled) {
  background: #b91c1c;
}

/* Response Display */
.response-display {
  background: #0f172a;
  border-radius: 8px;
  overflow: hidden;
}

.response-meta {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #1e293b;
  align-items: center;
  flex-wrap: wrap;
}

.response-status {
  padding: 4px 12px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.response-status.success {
  background: #166534;
  color: #86efac;
}

.response-status.fallback {
  background: #854d0e;
  color: #fde047;
}

.response-duration {
  color: #94a3b8;
  font-size: 0.85rem;
}

.response-reason {
  color: #f87171;
  font-size: 0.85rem;
}

.response-data {
  padding: 12px;
  font-size: 0.8rem;
  overflow-x: auto;
  max-height: 200px;
  color: #94a3b8;
}

/* Events Feed */
.events-panel {
  grid-column: 1 / -1;
}

.events-list {
  max-height: 300px;
  overflow-y: auto;
}

.event-item {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 0.85rem;
  align-items: center;
}

.event-item.state_change {
  background: rgba(59, 130, 246, 0.2);
}

.event-item.success {
  background: rgba(34, 197, 94, 0.2);
}

.event-item.failure,
.event-item.timeout {
  background: rgba(239, 68, 68, 0.2);
}

.event-item.reject {
  background: rgba(249, 115, 22, 0.2);
}

.event-item.probe {
  background: rgba(168, 85, 247, 0.2);
}

.event-time {
  color: #64748b;
  font-family: monospace;
  min-width: 80px;
}

.event-type {
  font-weight: 600;
  min-width: 100px;
  color: #f1f5f9;
}

.event-service {
  color: #3b82f6;
  min-width: 120px;
}

.event-details {
  color: #94a3b8;
  font-family: monospace;
  font-size: 0.75rem;
}

.no-data {
  color: #64748b;
  text-align: center;
  padding: 20px;
}

/* Responsive */
@media (max-width: 900px) {
  .main {
    grid-template-columns: 1fr;
  }

  .config-grid {
    grid-template-columns: 1fr;
  }

  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
