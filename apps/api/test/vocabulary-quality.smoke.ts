// Explicit opt-in: calls the configured AI provider with synthetic words only; no DB access.
import 'dotenv/config';
import { classifyVocabulary } from '../src/vocabulary-classification.js';
const cases = [
  ['buongiorno', 'добрый день', 'Buongiorno, dottore!', 'Общение'],
  ['chiedere', 'спрашивать', 'Chiedo un biglietto.', 'Общение'],
  ["l'amica / le amiche", 'подруга / подруги', "L'amica fa le amiche al plurale.", 'Семья и люди'],
  ['il fratello', 'брат', 'Mio fratello è medico.', 'Семья и люди'],
  ['alzarsi', 'вставать, подниматься', 'Mi alzo alle sette.', 'Дом и быт'],
  ['dormire', 'спать', 'Ieri ho dormito fino alle 9.', 'Дом и быт'],
  ['la giacca', 'куртка', 'Compro una giacca.', 'Дом и быт'],
  ['il pane', 'хлеб', 'Compro il pane in negozio.', 'Еда и напитки'],
  ['cucinare', 'готовить еду', 'Cucino ogni giorno.', 'Еда и напитки'],
  ["l'albergo", 'гостиница', 'Prenoto un albergo per la vacanza.', 'Путешествия'],
  ['la valigia', 'чемодан', 'La mia valigia è pronta.', 'Путешествия'],
  ['il treno', 'поезд', 'Vado al lavoro in treno.', 'Город и транспорт'],
  ['la strada', 'улица', 'La strada è lunga.', 'Город и транспорт'],
  ['il calcio', 'футбол', 'Gioco a calcio il sabato.', 'Спорт'],
  ['allenarsi', 'тренироваться', 'Mi alleno in palestra.', 'Спорт'],
  ['il professore', 'преподаватель', 'Il professore lavora a scuola.', 'Работа и учёба'],
  ["l'esame", 'экзамен', 'Ho un esame domani.', 'Работа и учёба'],
  [
    'la faccia / le facce',
    'лицо / лица',
    'La faccia ha una consonante prima di -cia e fa le facce.',
    'Тело и здоровье',
  ],
  ['la mano / le mani', 'рука / руки', 'Le mani sono fredde.', 'Тело и здоровье'],
  [
    'la farmacia / le farmacie',
    'аптека / аптеки',
    'La farmacia fa le farmacie.',
    'Тело и здоровье',
  ],
  [
    'lo psicologo / gli psicologi',
    'психолог / психологи',
    'Lo psicologo fa gli psicologi al plurale.',
    'Тело и здоровье',
  ],
  ['pagare', 'платить', 'Pago il pane.', 'Покупки и деньги'],
  ['il prezzo', 'цена', 'Il prezzo è alto.', 'Покупки и деньги'],
  ['il cane', 'собака', 'Il cane dorme.', 'Природа'],
  ['la pioggia', 'дождь', 'Oggi piove.', 'Природа'],
  ['domani', 'завтра', 'Domani vado in palestra.', 'Время и даты'],
  ['il lunedì', 'понедельник', 'Il lunedì studio.', 'Время и даты'],
  ['la gioia', 'радость', 'Provo gioia.', 'Чувства'],
  ['triste', 'грустный', 'Oggi sono triste.', 'Чувства'],
  ['il verbo', 'глагол', 'Dormire è un verbo.', 'Язык и грамматика'],
  ["l'italiano", 'итальянский язык', "Studio l'italiano.", 'Язык и грамматика'],
  ['ma', 'но', 'È piccolo ma bello.', 'Другое'],
  ['ogni', 'каждый', 'Ogni giorno studio.', 'Другое'],
];
const words = cases.map(([term, translation, example], i) => ({
  id: String(i),
  term,
  translation,
  example,
  partOfSpeech: null,
  semanticTopic: null,
}));
const results = await classifyVocabulary(words);
const failures = results
  .filter((r) => r.semanticTopic !== cases[Number(r.id)][3])
  .map((r) => ({
    term: cases[Number(r.id)][0],
    expected: cases[Number(r.id)][3],
    actual: r.semanticTopic,
  }));
const face = results.find((r) => r.id === '17');
console.log(
  JSON.stringify({
    synthetic: true,
    total: cases.length,
    matched: cases.length - failures.length,
    failures,
    facePartOfSpeech: face.partOfSpeech,
  }),
);
if (failures.length || face.partOfSpeech !== 'Существительное') process.exitCode = 1;
