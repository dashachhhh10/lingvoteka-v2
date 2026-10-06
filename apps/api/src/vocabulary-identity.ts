export const normaliseTerm = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');

export const normaliseMeaning = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

export const vocabularyIdentity = (term: string, translation: string) =>
  `${normaliseTerm(term)}\u0000${normaliseMeaning(translation)}`;
