<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '../services/api'
import { LogIn, Loader2, BookOpen } from 'lucide-vue-next'

const router = useRouter()
const form = ref({ username: '', password: '' })
const loading = ref(false)
const error = ref('')

const handleLogin = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await authService.login(form.value)
    localStorage.setItem('token', res.data.access_token)
    router.push('/')
  } catch (e: any) {
    error.value = 'Invalid username or password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[80vh] flex items-center justify-center">
    <div class="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <div class="bg-indigo-600 p-3 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
          <BookOpen class="text-white" :size="32" />
        </div>
        <h1 class="text-2xl font-black text-slate-800 tracking-tight">Welcome Back</h1>
        <p class="text-slate-400 font-bold text-sm">Log in to track your progress</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Username</label>
          <input v-model="form.username" type="text" required class="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-slate-700" placeholder="your_name">
        </div>
        <div>
          <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Password</label>
          <input v-model="form.password" type="password" required class="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-slate-700" placeholder="••••••••">
        </div>
        
        <p v-if="error" class="text-red-500 text-xs font-bold text-center">{{ error }}</p>

        <button type="submit" :disabled="loading" class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
          <Loader2 v-if="loading" class="animate-spin" :size="20" />
          <span v-else>Log In</span>
        </button>
      </form>

      <p class="mt-8 text-center text-sm font-bold text-slate-400">
        New here? <router-link to="/register" class="text-indigo-600 hover:underline">Create an account</router-link>
      </p>
    </div>
  </div>
</template>