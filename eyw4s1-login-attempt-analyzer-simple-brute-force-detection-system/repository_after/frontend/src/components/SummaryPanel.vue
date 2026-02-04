<template>
  <div class="summary-panel">
    <h2>Summary Statistics</h2>
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
        <span class="stat-value suspicious">{{ suspiciousCount }}</span>
        <div class="stat-label">Suspicious IPs</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  totalAttempts: number
  failedAttempts: number
  suspiciousCount: number
  loading: boolean
}

defineProps<Props>()
</script>

<style scoped>
.summary-panel {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.summary-panel h2 {
  color: #495057;
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
  font-size: 2rem;
  font-weight: bold;
  color: #007bff;
  display: block;
}

.stat-value.suspicious {
  color: #dc3545;
}

.stat-value.failed {
  color: #ffc107;
}

.stat-label {
  color: #6c757d;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

@media (max-width: 768px) {
  .summary-stats {
    grid-template-columns: 1fr;
  }
}
</style>
