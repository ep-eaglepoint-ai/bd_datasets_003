<template>
  <div class="attempts-table">
    <div class="table-header">
      Recent Login Attempts
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
              {{ attempt.success ? 'Success' : 'Failed' }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { type LoginAttempt } from '../api'

interface Props {
  attempts: LoginAttempt[]
  suspiciousIPs: string[]
  loading: boolean
  error: string | null
}

const props = defineProps<Props>()

// Check if an IP address is suspicious
const isSuspicious = (ipAddress: string): boolean => {
  return props.suspiciousIPs.includes(ipAddress)
}

// Format timestamp for display
const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString()
}
</script>

<style scoped>
.attempts-table {
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

@media (max-width: 768px) {
  table {
    font-size: 0.9rem;
  }
  
  th, td {
    padding: 0.5rem;
  }
}
</style>
