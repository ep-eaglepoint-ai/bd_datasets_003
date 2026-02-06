<template>
  <div class="container">
    <h1>Distributed Lock Manager Demo</h1>

    <div class="controls">
      <button @click="spawnClient">Spawn Client</button>
      <button @click="clearClients">Clear Clients</button>
    </div>

    <div class="dashboard">
      <div class="panel resources">
        <h2>Resources</h2>
        <ul>
          <li v-for="res in resources" :key="res.id">
            {{ res.name }} - <span :class="res.status">{{ res.status }}</span>
            <button @click="inspect(res)">Inspect</button>
          </li>
        </ul>
      </div>

      <div class="panel form" v-if="selectedResource">
        <h3>Acquire Lock: {{ selectedResource.name }}</h3>
        <label>Tenant ID: <input v-model="form.tenantId" /></label>
        <label
          >TTL (s): <input v-model.number="form.ttl" type="number"
        /></label>
        <label
          >Mode:
          <select v-model="form.mode">
            <option>EXCLUSIVE</option>
            <option>SHARED</option>
          </select></label
        >
        <button @click="acquireLock">Acquire</button>
        <button @click="forceRelease">Force Release (Admin)</button>
      </div>

      <div class="panel timeline">
        <h2>Timeline</h2>
        <div class="logs">
          <div v-for="log in logs" :key="log.id">
            {{ log.timestamp }}: {{ log.message }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";

const resources = ref([
  { id: "res-1", name: "Database-Primary", status: "FREE" },
  { id: "res-2", name: "File-Storage", status: "FREE" },
]);

const selectedResource = ref(null);
const logs = ref<{ id: number; timestamp: string; message: string }[]>([]);
const form = reactive({
  tenantId: "tenant-A",
  ttl: 30,
  mode: "EXCLUSIVE",
});

const connectWebSocket = () => {
  const ws = new WebSocket("ws://" + window.location.host + "/ws");
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    logs.value.unshift({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      message: `Event: ${data.type} on ${data.resource || data.lease}`,
    });
  };
};

onMounted(() => {
  connectWebSocket();
});

const inspect = (res: any) => {
  selectedResource.value = res;
};

const acquireLock = async () => {
  // Call API
  logs.value.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    message: "Attempting acquire...",
  });
};

const forceRelease = async () => {
  // Call API
};

const spawnClient = () => {
  // Web Worker logic simulated
};

const clearClients = () => {};
</script>

<style>
.container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  font-family: sans-serif;
}
.dashboard {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
}
.panel {
  border: 1px solid #ccc;
  padding: 10px;
}
.FREE {
  color: green;
}
.LOCKED {
  color: red;
}
</style>
