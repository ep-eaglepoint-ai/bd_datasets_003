export interface Book {
  id: number;
  title: string;
  author: string;
  cover_image: string;
  shelf: 'Want to Read' | 'Currently Reading' | 'Finished';
  current_page: number;
  total_pages: number;
  progress_percentage: number;
  rating?: number;
  notes?: string;
  date_started?: string;
  date_finished?: string;
}

export interface Stats {
  total_books: number;
  total_pages: number;
  average_rating: number;
  yearly_goal: number;
  completed_this_year: number;
  streak: number;
  monthly_data: number[];
}