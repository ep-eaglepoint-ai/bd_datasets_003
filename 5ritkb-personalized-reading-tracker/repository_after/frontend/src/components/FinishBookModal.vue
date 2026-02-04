<script setup lang="ts">
import { ref } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionRoot } from '@headlessui/vue'
import { Star } from 'lucide-vue-next'
import { bookService } from '../services/api'

const props = defineProps<{ book: any; isOpen: boolean }>()
const emit = defineEmits(['close', 'saved'])

const rating = ref(0)
const notes = ref('')
const saving = ref(false)

const saveFinishData = async () => {
  if (!props.book) return
  
  saving.value = true
  try {
    // Calling the backend route that i have tested in the postman
    await bookService.finishBook(props.book.id, {
      rating: rating.value,
      notes: notes.value
    })
    
    emit('saved')
    emit('close')
    // Reset local state for next use
    rating.value = 0
    notes.value = ''
  } catch (e) {
    console.error("Save Error:", e)
    alert("Failed to save. Check your connection.")
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <TransitionRoot as="template" :show="isOpen">
    <Dialog as="div" class="relative z-50" @close="emit('close')">
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <DialogPanel class="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
            <DialogTitle class="text-xl font-bold text-slate-900">Finish "{{ book?.title }}"</DialogTitle>
            
            <div class="mt-6 space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">Your Rating</label>
                <div class="flex gap-1">
                  <Star v-for="i in 5" :key="i" 
                    @click="rating = i"
                    :class="[i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300', 'cursor-pointer']" 
                    :size="28" 
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">Personal Notes & Highlights</label>
                <textarea 
                  v-model="notes"
                  placeholder="What did you learn? Favorite quotes?"
                  class="w-full h-32 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                ></textarea>
              </div>
            </div>

            <div class="mt-8 flex gap-3">
              <button @click="emit('close')" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button @click="saveFinishData" :disabled="saving" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">
                {{ saving ? 'Saving...' : 'Complete Book' }}
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>