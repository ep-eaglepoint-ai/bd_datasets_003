<template>
  <div class="space-y-6">
    <div class="bg-white shadow rounded-lg p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Reports</h1>
        <button @click="downloadCSV"
          class="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md">
          Download CSV
        </button>
      </div>

      <div class="flex flex-wrap gap-4 mb-6">
        <div>
          <label for="startDate" class="block text-sm font-medium text-gray-700">Start Date</label>
          <input v-model="startDate" type="date" id="startDate"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
        </div>
        <div>
          <label for="endDate" class="block text-sm font-medium text-gray-700">End Date</label>
          <input v-model="endDate" type="date" id="endDate"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
        </div>
        <div class="flex items-end">
          <button @click="fetchReport"
            class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md">
            Generate Report
          </button>
        </div>
      </div>
    </div>

    <div v-if="reportsStore.loading" class="text-center py-8">
      <p class="text-gray-500">Loading report...</p>
    </div>

    <div v-else-if="reportsStore.summary">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-6">
          <p class="text-sm text-gray-500">Total Hours</p>
          <p class="text-3xl font-bold text-indigo-600">{{ reportsStore.summary.total_hours.toFixed(1) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-6">
          <p class="text-sm text-gray-500">Total Entries</p>
          <p class="text-3xl font-bold text-indigo-600">{{ reportsStore.summary.total_entries }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-6">
          <p class="text-sm text-gray-500">Start Date</p>
          <p class="text-xl font-semibold">{{ formatDate(reportsStore.summary.start_date) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-6">
          <p class="text-sm text-gray-500">End Date</p>
          <p class="text-xl font-semibold">{{ formatDate(reportsStore.summary.end_date) }}</p>
        </div>
      </div>

      <div class="bg-white shadow rounded-lg p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Weekly Summary</h2>
        <div v-if="reportsStore.summary.weekly_summaries.length === 0" class="text-gray-500">
          No data for this period
        </div>
        <div v-else class="space-y-4">
          <div v-for="week in reportsStore.summary.weekly_summaries" :key="week.week_start"
            class="border rounded-lg p-4">
            <div class="flex justify-between items-center mb-2">
              <p class="font-medium">Week of {{ formatDate(week.week_start) }}</p>
              <p class="text-indigo-600 font-bold">{{ week.total_hours.toFixed(1) }}h</p>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <div v-for="day in week.daily_breakdown" :key="day.date"
                class="text-center p-2 bg-gray-50 rounded">
                <p class="text-xs text-gray-500">{{ getDayName(day.date) }}</p>
                <p class="font-medium">{{ day.total_hours.toFixed(1) }}h</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Daily Breakdown</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entries</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="day in reportsStore.summary.daily_summaries" :key="day.date">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ formatDate(day.date) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ day.total_hours.toFixed(2) }}h
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ day.entry_count }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const reportsStore = useReportsStore()
const startDate = ref('')
const endDate = ref('')

onMounted(async () => {
  await reportsStore.fetchSummary()
})

async function fetchReport() {
  await reportsStore.fetchSummary(startDate.value || undefined, endDate.value || undefined)
}

async function downloadCSV() {
  await reportsStore.downloadCSV(startDate.value || undefined, endDate.value || undefined)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

function getDayName(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })
}
</script>
