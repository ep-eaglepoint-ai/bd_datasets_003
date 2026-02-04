<template>
  <div class="relative w-full h-full bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100 shadow-inner group">
    <img 
      v-if="src && !hasError"
      :src="src" 
      :alt="title"
      @error="handleError"
      @load="handleLoad"
      :class="[
        'w-full h-full object-cover transition-all duration-500 group-hover:scale-105', 
        isLoaded ? 'opacity-100' : 'opacity-0'
      ]"
    />
    
    <div v-if="!isLoaded || hasError || !src" 
         class="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-50 to-slate-200">
      <div class="bg-white/80 p-3 rounded-2xl mb-3 shadow-sm">
        <BookIcon class="text-indigo-400 w-8 h-8" />
      </div>
      <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight px-2">
        {{ title || 'Untitled' }}
      </span>
      <div v-if="hasError" class="mt-2 text-[8px] font-bold text-red-400 uppercase tracking-tighter">
        Cover Unavailable
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Book as BookIcon } from 'lucide-vue-next';

const props = defineProps<{
  src?: string;
  title?: string;
}>();

const isLoaded = ref(false);
const hasError = ref(false);

watch(() => props.src, () => {
  isLoaded.value = false;
  hasError.value = false;
});

const handleLoad = () => {
  isLoaded.value = true;
  hasError.value = false;
};

const handleError = () => {
  hasError.value = true;
  isLoaded.value = true;
};
</script>