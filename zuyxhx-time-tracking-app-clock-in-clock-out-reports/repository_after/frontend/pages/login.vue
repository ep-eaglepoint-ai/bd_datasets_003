<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
      </div>
      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {{ error }}
        </div>
        <div class="rounded-md shadow-sm -space-y-px">
          <div>
            <label for="email" class="sr-only">Email address</label>
            <input 
              v-model="email" 
              id="email" 
              name="email" 
              type="email" 
              required
              @blur="validateEmail"
              :class="{'border-red-500': emailError}"
              class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Email address">
            <p v-if="emailError" class="mt-1 text-sm text-red-600">{{ emailError }}</p>
          </div>
          <div>
            <label for="password" class="sr-only">Password</label>
            <input 
              v-model="password" 
              id="password" 
              name="password" 
              type="password" 
              required
              @blur="validatePassword"
              :class="{'border-red-500': passwordError}"
              class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Password">
            <p v-if="passwordError" class="mt-1 text-sm text-red-600">{{ passwordError }}</p>
          </div>
        </div>
        <div>
          <button 
            type="submit" 
            :disabled="authStore.loading || !isFormValid"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            {{ authStore.loading ? 'Signing in...' : 'Sign in' }}
          </button>
        </div>
        <div class="text-center">
          <NuxtLink to="/register" class="text-indigo-600 hover:text-indigo-500">
            Don't have an account? Register
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const authStore = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const emailError = ref('')
const passwordError = ref('')

const isFormValid = computed(() => {
  return email.value.length > 0 && 
         password.value.length > 0 && 
         !emailError.value && 
         !passwordError.value
})

function validateEmail() {
  emailError.value = ''
  if (!email.value) {
    emailError.value = 'Email is required'
    return false
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) {
    emailError.value = 'Please enter a valid email address'
    return false
  }
  return true
}

function validatePassword() {
  passwordError.value = ''
  if (!password.value) {
    passwordError.value = 'Password is required'
    return false
  }
  if (password.value.length < 6) {
    passwordError.value = 'Password must be at least 6 characters'
    return false
  }
  return true
}

async function handleLogin() {
  error.value = ''
  emailError.value = ''
  passwordError.value = ''
  
  const isEmailValid = validateEmail()
  const isPasswordValid = validatePassword()
  
  if (!isEmailValid || !isPasswordValid) {
    return
  }
  
  const result = await authStore.login({ email: email.value, password: password.value })
  if (result.success) {
    await authStore.fetchUser()
    router.push('/dashboard')
  } else {
    error.value = result.error || 'Login failed'
  }
}
</script>
