export interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  imageUrl?: string;
  isBonus?: boolean;
}
