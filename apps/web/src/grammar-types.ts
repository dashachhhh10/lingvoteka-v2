export type TopicListItem = {
  id: string;
  title: string;
  summary: string | null;
  theoryStatus: string;
  practiceStatus: string;
  _count: { exercises: number; materials: number };
};
export type Theory = {
  when: string;
  formation: string;
  examples: { italian: string; russian: string }[];
  mistakes: string[];
};
export type Exercise = { id: string; position: number; prompt: string; options: string[] };
export type Topic = {
  id: string;
  title: string;
  summary: string | null;
  theory: Theory | null;
  theoryStatus: string;
  theoryError: string | null;
  practiceStatus: string;
  practiceError: string | null;
  materials: { sourceExcerpt: string | null; material: { id: string; title: string } }[];
  exercises: Exercise[];
};
export type Check = { correct: boolean; answerIndex: number; answer: string; explanation: string };
