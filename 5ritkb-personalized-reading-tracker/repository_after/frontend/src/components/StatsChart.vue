<template>
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-lg font-bold text-slate-800">Reading Activity</h3>
      <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Books per Month</span>
    </div>
    <div class="h-[300px] w-full">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';

const props = defineProps({
  data: {
    type: Array,
    required: true,
    default: () => Array(12).fill(0)
  }
});

const chartCanvas = ref(null);
let chartInstance = null;

const initChart = () => {
  if (chartInstance) {
    chartInstance.destroy();
  }

  const ctx = chartCanvas.value.getContext('2d');
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [{
        label: 'Books Finished',
        data: props.data,
        backgroundColor: '#6366f1',
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: '#4f46e5'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#94a3b8' },
          grid: { borderDash: [5, 5], color: '#f1f5f9' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      }
    }
  });
};

onMounted(() => {
  initChart();
});

// Watch for data changes like when the API response arrives
watch(() => props.data, () => {
  initChart();
}, { deep: true });
</script>