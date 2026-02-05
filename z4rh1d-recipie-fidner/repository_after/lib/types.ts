export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Recipe {
  id: string | number;
  title: string;
  ingredients: string[];
  difficulty: Difficulty;
  image: string;
}

export type FilterMode = 'any' | 'all';
