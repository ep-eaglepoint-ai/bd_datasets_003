import axios from 'axios';

const api = axios.create({
  baseURL: 'http://127.0.0.1:5000/api',
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = {
  register: (userData: any) => api.post('/auth/register', userData),
  login: (credentials: any) => api.post('/auth/login', credentials),
};

export const bookService = {
  // Requirement 4: Search books from mock data/API
  searchBooks: (query: string) => api.get(`/books/search?q=${query}`),
  
  // Requirement 2: View User's personal library
  getLibrary: () => api.get('/library'),
  
  // Requirement 2: Add a new book to a shelf
  addBook: (bookData: any) => api.post('/shelf/add', bookData),
  
  /**
   * Requirement 2 & 4: Update Progress or Status
   * Accepts 'current_page' for sliders or 'status' for shelf moving
   */
  updateProgress: (bookId: number, data: { current_page?: number; status?: string }) => 
    api.post(`/library/${bookId}/progress`, data),
  
  // Requirement 3: Finish Book (Submit Ratings & Notes)
  finishBook: (bookId: number, data: { rating: number; notes: string }) => 
    api.post(`/library/${bookId}/finish`, data),

  // New: Delete a book from the user's library
  deleteBook: (bookId: number) => 
    api.delete(`/library/${bookId}`),

  // Requirement 6: Analytics & Dashboard Stats
  getStats: () => api.get('/user/stats'),

  /**
   * Utility to change shelf status directly
   */
  moveToShelf: (bookId: number, status: string) => 
    api.post(`/library/${bookId}/progress`, { status }),
};

export default api;