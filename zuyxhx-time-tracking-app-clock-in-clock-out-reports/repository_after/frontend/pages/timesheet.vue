<template>
  <div class="bg-white shadow rounded-lg p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Timesheet</h1>

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
        <button @click="applyFilter"
          class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md">
          Filter
        </button>
      </div>
      <div class="flex items-end">
        <button @click="clearFilter"
          class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-md">
          Clear
        </button>
      </div>
    </div>

    <div v-if="timeStore.loading" class="text-center py-8">
      <p class="text-gray-500">Loading...</p>
    </div>

    <div v-else-if="timeStore.entries.length === 0" class="text-center py-8">
      <p class="text-gray-500">No time entries found</p>
    </div>

    <div v-else>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="entry in timeStore.entries" :key="entry.id">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ formatDate(entry.start_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatTime(entry.start_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ entry.end_at ? formatTime(entry.end_at) : '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ entry.duration_hours ? entry.duration_hours.toFixed(2) + 'h' : '-' }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {{ entry.notes || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="entry.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ entry.is_active ? 'Active' : 'Completed' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex justify-between items-center">
        <p class="text-sm text-gray-500">
          Showing {{ timeStore.entries.length }} of {{ timeStore.total }} entries
        </p>
        <div class="flex space-x-2">
          <button @click="prevPage" :disabled="timeStore.page <= 1"
            class="px-3 py-1 border rounded-md text-sm disabled:opacity-50">
            Previous
          </button>
          <button @click="nextPage" :disabled="timeStore.entries.length < timeStore.perPage"
            class="px-3 py-1 border rounded-md text-sm disabled:opacity-50">
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const timeStore = useTimeStore()
const startDate = ref('')
const endDate = ref('')

onMounted(async () => {
  await timeStore.fetchEntries()
})

async function applyFilter() {
  await timeStore.fetchEntries(startDate.value || undefined, endDate.value || undefined)
}

async function clearFilter() {
  startDate.value = ''
  endDate.value = ''
  await timeStore.fetchEntries()
}

async function prevPage() {
  if (timeStore.page > 1) {
    timeStore.page--
    await timeStore.fetchEntries(startDate.value || undefined, endDate.value || undefined)
  }
}

async function nextPage() {
  timeStore.page++
  await timeStore.fetchEntries(startDate.value || undefined, endDate.value || undefined)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>
