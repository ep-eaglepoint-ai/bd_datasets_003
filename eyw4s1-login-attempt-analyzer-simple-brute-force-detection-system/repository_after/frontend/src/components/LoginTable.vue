<template>
  <div class="login-table">
    <div class="table-header">
      Login Attempts
    </div>
    
    <!-- Summary Panel -->
    <div class="summary-panel">
      <h3>Summary Statistics</h3>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-value">{{ totalAttempts }}</span>
          <div class="stat-label">Total Attempts</div>
        </div>
        <div class="stat-item">
          <span class="stat-value failed">{{ failedAttempts }}</span>
          <div class="stat-label">Failed Attempts</div>
        </div>
        <div class="stat-item">
          <span class="stat-value suspicious">{{ flaggedIPs }}</span>
          <div class="stat-label">Flagged IPs</div>
        </div>
      </div>
    </div>
    
    <div v-if="loading" class="loading">
      Loading login attempts...
    </div>
    
    <div v-else-if="error" class="error">
      {{ error }}
    </div>
    
    <div v-else-if="attempts.length === 0" class="empty">
      No login attempts found
    </div>
    
    <table v-else>
      <thead>
        <tr>
          <th>Username</th>
          <th>IP Address</th>
          <th>Timestamp</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr 
          v-for="attempt in attempts" 
          :key="attempt.id"
          :class="{ suspicious: isSuspicious(attempt.ip_address) }"
        >
          <td>{{ attempt.username }}</td>
          <td>{{ attempt.ip_address }}</td>
          <td>{{ formatTimestamp(attempt.timestamp) }}</td>
          <td>
            <span :class="attempt.success ? 'success' : 'failed'">
              {{ formatStatus(attempt.success) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { loginAttemptApi, type LoginAttempt, type SuspiciousActivity } from '../api'

// Reactive data
const attempts = ref<LoginAttempt[]>([])
const suspiciousActivity = ref<SuspiciousActivity | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Computed properties for summary statistics
const totalAttempts = computed(() => attempts.value.length)
const failedAttempts = computed(() => 
  attempts.value.filter(attempt => !attempt.success).length
)
const flaggedIPs = computed(() => 
  suspiciousActivity.value?.total_suspicious_ips || 0
)

// Fetch both login attempts and suspicious activity
const fetchData = async () => {
  try {
    loading.value = true
    error.value = null
    
    // Fetch both datasets in parallel
    const [attemptsData, suspiciousData] = await Promise.all([
      loginAttemptApi.getLoginAttempts(),
      loginAttemptApi.getSuspiciousActivity(),
    ])
    
    attempts.value = attemptsData
    suspiciousActivity.value = suspiciousData
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch data'
    console.error('Error fetching data:', err)
  } finally {
    loading.value = false
  }
}

// Check if an IP address is suspicious
const isSuspicious = (ipAddress: string): boolean => {
  return suspiciousActivity.value?.suspicious_ips.includes(ipAddress) || false
}

// Format timestamp for display
const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString()
}

// Format status for display
const formatStatus = (success: boolean): string => {
  return success ? 'Success' : 'Failed'
}

// Fetch data on component mount
onMounted(() => {
  fetchData()
})

// Expose methods for testing
defineExpose({
  fetchData,
  formatTimestamp,
  formatStatus,
  isSuspicious
})
</script>

<style scoped>
.login-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.table-header {
  background: #007bff;
  color: white;
  padding: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.summary-panel {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1.5rem;
  margin: 1rem;
}

.summary-panel h3 {
  color: #495057;
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-item {
  text-align: center;
  padding: 1rem;
  background: white;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #007bff;
  display: block;
}

.stat-value.failed {
  color: #dc3545;
}

.stat-value.suspicious {
  color: #ffc107;
}

.stat-label {
  color: #6c757d;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #dee2e6;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  color: #495057;
}

.suspicious {
  background-color: #fff3cd;
  color: #856404;
}

.suspicious td {
  font-weight: 600;
}

.success {
  color: #28a745;
  font-weight: 600;
}

.failed {
  color: #dc3545;
  font-weight: 600;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}

.error {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem;
  border-radius: 6px;
  margin: 1rem 0;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}

@media (max-width: 768px) {
  .summary-stats {
    grid-template-columns: 1fr;
  }
  
  table {
    font-size: 0.9rem;
  }
  
  th, td {
    padding: 0.5rem;
  }
}
</style>
