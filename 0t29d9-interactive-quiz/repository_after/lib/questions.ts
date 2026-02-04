export interface Question {
  id: number;
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
}

export const questions: Question[] = [
  {
    id: 1,
    questionText: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctAnswerIndex: 2,
  },
  {
    id: 2,
    questionText: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctAnswerIndex: 1,
  },
  {
    id: 3,
    questionText: "What is the largest mammal in the world?",
    options: ["African Elephant", "Blue Whale", "Giraffe", "Great White Shark"],
    correctAnswerIndex: 1,
  },
  {
    id: 4,
    questionText: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"],
    correctAnswerIndex: 1,
  },
  {
    id: 5,
    questionText: "What includes the atomic symbol 'Fe'?",
    options: ["Gold", "Silver", "Iron", "Zinc"],
    correctAnswerIndex: 2,
  },
  {
    id: 6,
    questionText: "Which is the largest ocean on Earth?",
    options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
    correctAnswerIndex: 3,
  },
  {
    id: 7,
    questionText: "In which year did the Titanic sink?",
    options: ["1912", "1905", "1918", "1923"],
    correctAnswerIndex: 0,
  },
  {
    id: 8,
    questionText: "What is the chemical formula for water?",
    options: ["CO2", "H2O", "O2", "NaCl"],
    correctAnswerIndex: 1,
  },
  {
    id: 9,
    questionText: "Which country is home to the Kangaroo?",
    options: ["New Zealand", "South Africa", "Australia", "Brazil"],
    correctAnswerIndex: 2,
  },
  {
    id: 10,
    questionText: "What is the square root of 64?",
    options: ["6", "7", "8", "9"],
    correctAnswerIndex: 2,
  },
];
