export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  typescript: {
    strict: true
  },
  runtimeConfig: {
    circuitBreaker: {
      defaultFailureThreshold: 5,
      defaultResetTimeout: 30000,
      defaultSuccessThreshold: 3,
      defaultTimeout: 5000,
      defaultBulkheadLimit: 10,
      defaultRollingWindowSize: 60000,
      defaultBucketSize: 1000,
      defaultMinimumRequestVolume: 10,
      defaultFailureRateThreshold: 50,
      defaultTimeoutRateThreshold: 50,
      defaultHalfOpenProbeLimit: 3
    }
  }
})
