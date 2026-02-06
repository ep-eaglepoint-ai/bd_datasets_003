<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 text-center">
      <h1 class="text-4xl font-extrabold text-gray-900">Time Tracking App</h1>
      <p class="mt-2 text-lg text-gray-600">Track your working hours with ease</p>
      <div class="mt-8 space-y-4">
        <NuxtLink to="/login" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
          Login
        </NuxtLink>
        <NuxtLink to="/register" class="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
          Register
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
