<script setup lang="ts">
import { Plus, LayoutDashboard, BookOpen } from 'lucide-vue-next';
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <nav class="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2 group">
          <div class="bg-indigo-600 p-1.5 rounded-lg group-hover:rotate-6 transition-transform">
             <BookOpen class="text-white w-5 h-5" />
          </div>
          <h1 class="text-xl font-black text-slate-800 tracking-tighter uppercase">ReaderFlow</h1>
        </router-link>
        
        <div class="flex items-center gap-4">
          <router-link to="/" class="text-slate-500 hover:text-indigo-600 font-bold px-3 py-2 flex items-center gap-2 transition-colors" active-class="text-indigo-600">
            <LayoutDashboard :size="18" /> <span class="hidden md:inline">Dashboard</span>
          </router-link>
          
          <router-link to="/search" class="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 font-bold active:scale-95">
            <Plus :size="18" /> Find New Books
          </router-link>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto p-4 md:p-8">
      <router-view />
    </main>
  </div>
</template>