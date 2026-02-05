<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '../services/api'
import { UserPlus, Loader2, BookOpen, Target } from 'lucide-vue-next'

const router = useRouter()
const form = ref({ 
  username: '', 
  password: '',
  yearly_goal: 12 
})
const loading = ref(false)
const error = ref('')

const handleRegister = async () => {
  loading.value = true
  error.value = ''
  try {
    // Create the account using the full form object
    await authService.register(form.value)
    
    // Automatically log them in - Fixed .value access here
    const loginRes = await authService.login({
      username: form.value.username,
      password: form.value.password
    })
    
    localStorage.setItem('token', loginRes.data.access_token)
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.msg || 'Registration failed. Try a different username.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[85vh] flex items-center justify-center p-4">
    <div class="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 w-full max-w-md">
      
      <div class="flex flex-col items-center mb-8">
        <div class="bg-indigo-600 p-3 rounded-2xl mb-4 shadow-lg shadow-indigo-200 text-white">
          <UserPlus :size="32" />
        </div>
        <h1 class="text-2xl font-black text-slate-800 tracking-tight text-center">Join the Library</h1>
        <p class="text-slate-400 font-bold text-sm text-center">Start your reading journey today</p>
      </div>

      <form @submit.prevent="handleRegister" class="space-y-5">
        <div>
          <label class="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 ml-1">Username</label>
          <input v-model="form.username" type="text" required 
            class="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-slate-700" 
            placeholder="Choose a username">
        </div>

        <div>
          <label class="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 ml-1">Password</label>
          <input v-model="form.password" type="password" required 
            class="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-slate-700" 
            placeholder="••••••••">
        </div>

        <div>
          <label class="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 ml-1 flex items-center gap-2">
            <Target :size="12" /> Yearly Reading Goal
          </label>
          <div class="relative">
            <input v-model.number="form.yearly_goal" type="number" min="1" max="999" required 
              class="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-slate-700">
            <span class="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300 uppercase">Books</span>
          </div>
          <p class="mt-2 text-[10px] text-slate-400 font-medium px-1 italic">You can change this later in settings.</p>
        </div>
        
        <p v-if="error" class="text-red-500 text-xs font-bold text-center bg-red-50 py-2 rounded-lg">{{ error }}</p>

        <button type="submit" :disabled="loading" 
          class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 mt-4">
          <Loader2 v-if="loading" class="animate-spin" :size="20" />
          <span v-else>Create My Account</span>
        </button>
      </form>

      <div class="mt-8 pt-8 border-t border-slate-50">
        <p class="text-center text-sm font-bold text-slate-400">
          Already a member? <router-link to="/login" class="text-indigo-600 hover:underline">Sign In</router-link>
        </p>
      </div>
    </div>
  </div>
</template>