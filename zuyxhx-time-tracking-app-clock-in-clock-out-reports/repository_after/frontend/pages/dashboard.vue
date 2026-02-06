<template>
  <div class="space-y-6">
    <div class="bg-white shadow rounded-lg p-6">
      <h1 class="text-2xl font-bold text-gray-900 mb-4">Dashboard</h1>
      
      <div class="flex items-center justify-between mb-6">
        <div>
          <p class="text-lg">
            Status: 
            <span :class="timeStore.isClockedIn ? 'text-green-600' : 'text-gray-500'" class="font-semibold">
              {{ timeStore.isClockedIn ? 'Clocked In' : 'Clocked Out' }}
            </span>
          </p>
          <p v-if="timeStore.activeEntry" class="text-sm text-gray-500 mt-1">
            Since: {{ formatDateTime(timeStore.activeEntry.start_at) }}
          </p>
        </div>
      </div>

      <div class="mb-6">
        <label for="notes" class="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
        <textarea v-model="notes" id="notes" rows="2"
          class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md border p-2"
          placeholder="What are you working on?"></textarea>
      </div>

      <div class="flex space-x-4">
        <button v-if="!timeStore.isClockedIn" @click="handleClockIn" :disabled="timeStore.loading"
          class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50">
          {{ timeStore.loading ? 'Processing...' : 'Clock In' }}
        </button>
        <button v-else @click="handleClockOut" :disabled="timeStore.loading"
          class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50">
          {{ timeStore.loading ? 'Processing...' : 'Clock Out' }}
        </button>
      </div>

      <div v-if="error" class="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {{ error }}
      </div>
    </div>

    <div v-if="timeStore.activeEntry" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Current Session</h2>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-500">Started At</p>
          <p class="font-medium">{{ formatDateTime(timeStore.activeEntry.start_at) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Duration</p>
          <p class="font-medium">{{ currentDuration }}</p>
        </div>
        <div v-if="timeStore.activeEntry.notes" class="col-span-2">
          <p class="text-sm text-gray-500">Notes</p>
          <p class="font-medium">{{ timeStore.activeEntry.notes }}</p>
        </div>
      </div>
    </div>

    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Recent Entries</h2>
      <div v-if="timeStore.entries.length === 0" class="text-gray-500 text-center py-4">
        No recent entries
      </div>
      <div v-else class="space-y-3">
        <div v-for="entry in timeStore.entries.slice(0, 5)" :key="entry.id"
          class="flex justify-between items-center border-b pb-3">
          <div>
            <p class="font-medium">{{ formatDate(entry.start_at) }}</p>
            <p class="text-sm text-gray-500">{{ entry.notes || 'No notes' }}</p>
          </div>
          <div class="text-right">
            <p class="font-medium">{{ entry.duration_hours ? entry.duration_hours.toFixed(2) + 'h' : 'Active' }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const timeStore = useTimeStore()
const notes = ref('')
const error = ref('')
const currentDuration = ref('0:00:00')
let durationInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await timeStore.fetchStatus()
  await timeStore.fetchEntries()
  startDurationTimer()
})

onUnmounted(() => {
  if (durationInterval) clearInterval(durationInterval)
})

function startDurationTimer() {
  durationInterval = setInterval(() => {
    if (timeStore.activeEntry) {
      const start = new Date(timeStore.activeEntry.start_at).getTime()
      const now = Date.now()
      const diff = Math.floor((now - start) / 1000)
      const hours = Math.floor(diff / 3600)
      const minutes = Math.floor((diff % 3600) / 60)
      const seconds = diff % 60
      currentDuration.value = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
  }, 1000)
}

async function handleClockIn() {
  error.value = ''
  const result = await timeStore.clockIn({ notes: notes.value || undefined })
  if (!result.success) {
    error.value = result.error || 'Failed to clock in'
  } else {
    notes.value = ''
  }
}

async function handleClockOut() {
  error.value = ''
  const result = await timeStore.clockOut({ notes: notes.value || undefined })
  if (!result.success) {
    error.value = result.error || 'Failed to clock out'
  } else {
    notes.value = ''
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}
</script>
