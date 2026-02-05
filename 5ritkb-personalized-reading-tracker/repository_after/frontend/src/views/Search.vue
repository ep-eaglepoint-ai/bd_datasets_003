<script setup lang="ts">
import { ref } from 'vue'
import { Search as SearchIcon, Loader2, BookOpen, CheckCircle, Bookmark } from 'lucide-vue-next'
import api from '../services/api'
import BookCover from '../components/BookCover.vue'

const query = ref('')
const results = ref<any[]>([])
const searching = ref(false)

const handleSearch = async () => {
  if (query.value.length < 2) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const response = await api.get(`/books/search?q=${query.value}`)
    results.value = response.data
  } catch (e) {
    console.error("Search API Error:", e)
  } finally {
    searching.value = false
  }
}

const addToShelf = async (book: any, status: string) => {
  try {
    const payload = {
      id: book.id,
      title: book.title,
      author: book.author,
      cover: book.cover,
      pages: book.pages,
      status: status    
    }
    await api.post('/shelf/add', payload)
    alert(`Added "${book.title}" to library!`)
  } catch (e: any) {
    if (e.response?.status === 400) {
      alert("This book is already in your library!")
    }
  }
}
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <h1 class="text-3xl font-black mb-2 text-slate-800 tracking-tight">Find New Books</h1>
    <p class="text-slate-500 mb-8 font-medium">Search the library and add books to your shelves.</p>
    
    <div class="relative mb-8">
      <SearchIcon class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" :size="20" />
      <input 
        v-model="query"
        @input="handleSearch"
        type="text" 
        placeholder="Search by title or author..."
        class="w-full pl-12 pr-4 py-4 bg-white rounded-2xl shadow-sm border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
      />
    </div>

    <div v-if="searching" class="flex justify-center py-10">
      <Loader2 class="animate-spin text-indigo-600" :size="40" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="book in results" :key="book.id" 
           class="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex gap-4 hover:shadow-xl transition-all duration-300">
        
        <div class="w-24 h-36 flex-shrink-0">
          <BookCover :src="book.cover" :title="book.title" />
        </div>
        
        <div class="flex-1 flex flex-col justify-between">
          <div>
            <div class="font-black text-lg text-slate-900 leading-tight">{{ book.title }}</div>
            <div class="text-sm font-bold text-slate-400 mt-1 uppercase tracking-wider">{{ book.author }}</div>
          </div>

          <div class="flex flex-wrap gap-2 mt-4">
            <button @click="addToShelf(book, 'want-to-read')" 
                    class="flex items-center gap-1.5 text-xs font-black bg-slate-100 text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-200">
              <Bookmark :size="14" /> Want
            </button>
            <button @click="addToShelf(book, 'currently-reading')" 
                    class="flex items-center gap-1.5 text-xs font-black bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl hover:bg-indigo-100">
              <BookOpen :size="14" /> Reading
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>