export const PARTS_OF_SPEECH = [
  'Существительное',
  'Глагол',
  'Прилагательное',
  'Наречие',
  'Местоимение',
  'Артикль',
  'Предлог',
  'Союз',
  'Числительное',
  'Междометие',
  'Выражение',
  'Другое',
] as const;

export const SEMANTIC_TOPICS = [
  'Общение',
  'Семья и люди',
  'Дом и быт',
  'Еда и напитки',
  'Путешествия',
  'Город и транспорт',
  'Спорт',
  'Работа и учёба',
  'Здоровье',
  'Покупки и деньги',
  'Природа',
  'Время и даты',
  'Чувства',
  'Язык и грамматика',
  'Другое',
] as const;

export const isPartOfSpeech = (value: unknown): value is (typeof PARTS_OF_SPEECH)[number] =>
  typeof value === 'string' && PARTS_OF_SPEECH.some((item) => item === value);

export const isSemanticTopic = (value: unknown): value is (typeof SEMANTIC_TOPICS)[number] =>
  typeof value === 'string' && SEMANTIC_TOPICS.some((item) => item === value);

export const validCategories = (partOfSpeech: unknown, semanticTopic: unknown) =>
  isPartOfSpeech(partOfSpeech) && isSemanticTopic(semanticTopic);
