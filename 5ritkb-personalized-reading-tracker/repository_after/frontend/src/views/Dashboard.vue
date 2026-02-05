<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { bookService } from '../services/api';
import type { Stats, Book } from '../types';
import StatsChart from '../components/StatsChart.vue';
import FinishBookModal from '../components/FinishBookModal.vue'; 
import BookCover from '../components/BookCover.vue';
import { 
  BookOpen, Flame, BarChart3, CheckCircle, ArrowRight, 
  Bookmark, Star, Play, Trash2, Clock 
} from 'lucide-vue-next';

// State Management
const stats = ref<Stats | null>(null);
const library = ref<Book[]>([]);
const loading = ref(true);

// Modal State
const isModalOpen = ref(false);
const selectedBook = ref<Book | null>(null);

const fetchDashboard = async () => {
  try {
    const [statsRes, libRes] = await Promise.all([
      bookService.getStats(),
      bookService.getLibrary()
    ]);
    stats.value = statsRes.data;
    library.value = libRes.data;
  } catch (err) {
    console.error("Error loading dashboard", err);
  } finally {
    loading.value = false;
  }
};

// Filters
const currentlyReading = computed(() => 
  library.value.filter(b => b.status === 'currently-reading')
);

const wantToReadBooks = computed(() => 
  library.value.filter(b => b.status === 'want-to-read')
);

const finishedBooks = computed(() => 
  library.value.filter(b => b.status === 'finished')
    .sort((a, b) => new Date(b.last_updated || 0).getTime() - new Date(a.last_updated || 0).getTime())
    .slice(0, 4)
);

// Actions
const updateProgress = async (book: Book, newPage: number) => {
  try {
    await bookService.updateProgress(book.id, { current_page: newPage });
    book.current_page = newPage; 
  } catch (err) {
    console.error("Failed to update progress", err);
  }
};

const startReading = async (bookId: number) => {
  try {
    await bookService.updateProgress(bookId, { status: 'currently-reading' });
    await fetchDashboard();
  } catch (err) {
    console.error("Failed to start reading", err);
  }
};

const removeBook = async (bookId: number, title: string) => {
  if (confirm(`Remove "${title}" from your library?`)) {
    try {
      await bookService.deleteBook(bookId);
      await fetchDashboard();
    } catch (err) {
      console.error("Failed to delete book", err);
    }
  }
};

const openFinishModal = (book: Book) => {
  selectedBook.value = book;
  isModalOpen.value = true;
};

const handleSaved = () => {
  fetchDashboard();
};

onMounted(fetchDashboard);
</script>

<template>
  <div v-if="loading" class="flex justify-center items-center min-h-[60vh]">
    <div class="flex flex-col items-center gap-3">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      <div class="animate-pulse text-indigo-600 font-medium">Syncing Library...</div>
    </div>
  </div>

  <div v-else class="max-w-7xl mx-auto p-4 md:p-8 space-y-10">
    
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div class="p-3 bg-orange-100 text-orange-600 rounded-2xl"><Flame /></div>
        <div>
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Streak</p>
          <p class="text-2xl font-black text-slate-800">{{ stats?.streak || 0 }} Days</p>
        </div>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div class="p-3 bg-purple-100 text-purple-600 rounded-2xl"><Clock /></div>
        <div>
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Time</p>
          <p class="text-2xl font-black text-slate-800">{{ stats?.avg_reading_time?.toFixed(1) || '0.0' }} <span class="text-xs">Days</span></p>
        </div>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div class="flex justify-between items-end mb-3">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Yearly Goal</p>
          <p class="text-sm font-black text-indigo-600">{{ stats?.completed_this_year }} / {{ stats?.yearly_goal }}</p>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div class="bg-indigo-600 h-full transition-all duration-1000 ease-out" 
               :style="{ width: Math.min(((stats?.completed_this_year || 0) / (stats?.yearly_goal || 1)) * 100, 100) + '%' }">
          </div>
        </div>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div class="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Star /></div>
        <div>
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Rating</p>
          <p class="text-2xl font-black text-slate-800">{{ stats?.average_rating?.toFixed(1) || '0.0' }}</p>
        </div>
      </div>
    </div>

    <div v-if="wantToReadBooks.length > 0">
      <h2 class="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
        <Bookmark class="text-indigo-500 w-5 h-5" /> Your Reading List
      </h2>
      <div class="flex gap-6 overflow-x-auto pb-6 no-scrollbar">
        <div v-for="book in wantToReadBooks" :key="book.id" 
             class="flex-shrink-0 w-36 group">
          <div class="relative overflow-hidden rounded-2xl shadow-md transition-all duration-300 group-hover:-translate-y-1">
            <div class="h-52" @click="startReading(book.id)">
                <BookCover :src="book.cover_image" :title="book.title" />
            </div>
            <div @click="startReading(book.id)" class="absolute inset-0 bg-indigo-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 cursor-pointer">
              <Play class="text-white fill-current mb-2" :size="32" />
              <span class="text-white text-[10px] font-black uppercase tracking-widest">Start</span>
            </div>
            <button @click.stop="removeBook(book.id, book.title)" class="absolute top-2 right-2 p-2 bg-white/20 backdrop-blur-md text-white rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
              <Trash2 :size="14" />
            </button>
          </div>
          <p class="mt-3 text-xs font-black text-slate-800 truncate">{{ book.title }}</p>
          <p class="text-[10px] font-bold text-slate-400 uppercase truncate">{{ book.author }}</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
      
      <div class="lg:col-span-2 space-y-12">
        
        <section class="space-y-6">
          <h2 class="text-xl font-black flex items-center gap-2 text-slate-800">
            <BookOpen class="text-indigo-600" /> Currently Reading
          </h2>
          
          <div v-if="currentlyReading.length === 0" class="bg-white p-16 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center">
            <p class="text-slate-500 font-bold mb-4">You aren't reading anything right now.</p>
            <router-link to="/search" class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm">
              Browse Books <ArrowRight :size="18"/>
            </router-link>
          </div>

          <div v-for="book in currentlyReading" :key="book.id" 
               class="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8 hover:shadow-xl transition-all duration-500 group relative">
            
            <button @click="removeBook(book.id, book.title)" class="absolute top-4 right-4 p-2 text-slate-200 hover:text-red-500 transition-colors">
              <Trash2 :size="18" />
            </button>

            <div class="w-28 h-40 flex-shrink-0">
              <BookCover :src="book.cover_image" :title="book.title" />
            </div>
            
            <div class="flex-1">
              <div class="flex justify-between items-start mb-4">
                <div>
                  <h3 class="text-xl font-black text-slate-900 leading-tight pr-8">{{ book.title }}</h3>
                  <p class="text-slate-400 font-bold text-sm uppercase tracking-wide">{{ book.author }}</p>
                </div>
                <button @click="openFinishModal(book)" 
                        class="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-600 rounded-2xl text-xs font-black hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                  <CheckCircle :size="16" /> Done
                </button>
              </div>
              
              <div class="space-y-4">
                <div class="flex justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
                  <span>Page {{ book.current_page }} of {{ book.total_pages }}</span>
                  <span class="text-indigo-600">{{ Math.round((book.current_page / (book.total_pages || 1)) * 100) }}%</span>
                </div>
                <input 
                  type="range" 
                  :value="book.current_page"
                  :max="book.total_pages"
                  @change="(e) => updateProgress(book, parseInt((e.target as HTMLInputElement).value))"
                  class="w-full h-2.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h2 class="font-black text-slate-800 mb-8 flex items-center gap-2 uppercase text-xs tracking-[0.2em]">
            <BarChart3 :size="18" class="text-indigo-600" /> Reading Activity
          </h2>
          <div class="h-[300px] w-full">
            <StatsChart v-if="stats && stats.monthly_data" :data="stats.monthly_data" />
          </div>
        </section>
      </div>

      <div class="space-y-8">
        <div v-if="finishedBooks.length > 0" class="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl">
          <h2 class="text-xs font-black tracking-widest uppercase mb-8 text-slate-400 border-b border-slate-800 pb-4">Recently Finished</h2>
          <div class="space-y-8">
            <div v-for="book in finishedBooks" :key="book.id" class="flex gap-4 items-center group">
              <div class="w-14 h-20 flex-shrink-0 shadow-lg">
                <BookCover :src="book.cover_image" :title="book.title" />
              </div>
              <div class="overflow-hidden">
                <p class="font-black text-sm truncate">{{ book.title }}</p>
                <p class="text-[10px] font-bold text-slate-500 uppercase truncate mb-1">{{ book.author }}</p>
                <div class="flex text-yellow-400">
                  <Star v-for="i in 5" :key="i" :size="10" :class="i <= (book.rating || 0) ? 'fill-current' : 'text-slate-700'" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
          <p class="text-indigo-900 font-black text-xs uppercase tracking-wider mb-2">Did you know?</p>
          <p class="text-indigo-700/80 text-sm font-medium leading-relaxed">
            Consistently updating your page progress helps maintain your reading streak!
          </p>
        </div>
      </div>
    </div>

    <FinishBookModal 
      :is-open="isModalOpen" 
      :book="selectedBook" 
      @close="isModalOpen = false" 
      @saved="handleSaved" 
    />
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

input[type=range]::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  background: #4f46e5;
  border: 3px solid white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
</style>