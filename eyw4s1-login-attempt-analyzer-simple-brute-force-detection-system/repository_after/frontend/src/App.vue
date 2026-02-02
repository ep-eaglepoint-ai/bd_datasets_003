<template>
  <div class="container">
    <div class="header">
      <h1>Login Attempt Analyzer</h1>
      <p>Monitor and detect brute-force login attacks</p>
    </div>

    <div class="dashboard">
      <!-- Summary Panel -->
      <SummaryPanel
        :totalAttempts="totalAttempts"
        :suspiciousCount="suspiciousCount"
        :loading="summaryLoading"
      />

      <!-- Login Attempts Table -->
      <LoginAttemptsTable
        :attempts="loginAttempts"
        :suspiciousIPs="suspiciousIPs"
        :loading="tableLoading"
        :error="error"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { loginAttemptApi, type LoginAttempt, type SuspiciousActivity } from './api'
import SummaryPanel from './components/SummaryPanel.vue'
import LoginAttemptsTable from './components/LoginAttemptsTable.vue'

// Reactive data
const loginAttempts = ref<LoginAttempt[]>([])
const suspiciousActivity = ref<SuspiciousActivity | null>(null)
const totalAttempts = ref(0)
const suspiciousCount = ref(0)
const suspiciousIPs = ref<string[]>([])
const summaryLoading = ref(false)
const tableLoading = ref(false)
const error = ref<string | null>(null)

// Fetch data from API
const fetchData = async () => {
  try {
    error.value = null
    tableLoading.value = true
    summaryLoading.value = true

    // Fetch login attempts and suspicious activity in parallel
    const [attemptsData, suspiciousData] = await Promise.all([
      loginAttemptApi.getLoginAttempts(),
      loginAttemptApi.getSuspiciousActivity(),
    ])

    loginAttempts.value = attemptsData
    suspiciousActivity.value = suspiciousData
    totalAttempts.value = attemptsData.length
    suspiciousCount.value = suspiciousData.total_suspicious_ips
    suspiciousIPs.value = suspiciousData.suspicious_ips
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch data'
    console.error('Error fetching data:', err)
  } finally {
    tableLoading.value = false
    summaryLoading.value = false
  }
}

// Fetch data on component mount
onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.header p {
  color: #6c757d;
  font-size: 1.1rem;
}

.dashboard {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}
</style>
