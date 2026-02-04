import { questions } from '@/lib/questions';

describe('Quiz Data Validation', () => {
  it('should have at least 10 questions', () => {
    expect(questions.length).toBeGreaterThanOrEqual(10);
  });

  it('each question should have exactly 4 options', () => {
    questions.forEach((q) => {
      expect(q.options).toHaveLength(4);
    });
  });

  it('each question should have a valid correct answer index', () => {
    questions.forEach((q) => {
      expect(q.correctAnswerIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctAnswerIndex).toBeLessThan(4);
    });
  });

  it('each question should have unique text (no duplicates)', () => {
    const questionTexts = new Set(questions.map((q) => q.questionText));
    expect(questionTexts.size).toBe(questions.length);
  });
});
