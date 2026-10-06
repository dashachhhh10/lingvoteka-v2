import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { StaggerList } from './Motion';

type VocabDraft = {
  term: string;
  translation: string;
  example: string;
  sourceExcerpt: string;
  alreadyInVocabulary?: boolean;
  otherMeaningInVocabulary?: boolean;
};
type GrammarDraft = { title: string; summary: string; sourceExcerpt: string };
type Draft = { vocabulary: VocabDraft[]; grammar: GrammarDraft[] };
type MaterialListItem = {
  id: string;
  title: string;
  lessonDate: string | null;
  deadline: string | null;
  status: string;
  analysisError: string | null;
  createdAt: string;
  _count: { files: number; vocabulary: number; grammar: number };
};
type MaterialDetail = {
  id: string;
  title: string;
  lessonDate: string | null;
  deadline: string | null;
  noteText: string | null;
  status: string;
  analysisDraft: Draft | null;
  analysisError: string | null;
  files: { id: string; name: string; byteSize: number }[];
  vocabulary: {
    vocabItem: { id: string; term: string; translation: string; example: string | null };
  }[];
  grammar: { grammarTopic: { id: string; title: string; summary: string | null } }[];
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ru', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value))
    : null;
const emptyVocab = (): VocabDraft => ({
  term: '',
  translation: '',
  example: '',
  sourceExcerpt: '',
});
const emptyGrammar = (): GrammarDraft => ({ title: '', summary: '', sourceExcerpt: '' });

export function MaterialsPage() {
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<MaterialListItem[]>('/api/materials')
      .then(setItems)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ТВОИ УРОКИ</p>
          <h1 className="page-title">Материалы</h1>
          <p className="page-lead">
            Добавляй файлы или текст, чтобы собрать слова и темы для практики.
          </p>
        </div>
        <Link className="action-link" to="/materials/new">
          Добавить материал <span aria-hidden="true">↗</span>
        </Link>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="subtle">Загружаем материалы…</p>
      ) : items.length === 0 ? (
        <section className="empty-section">
          <div className="empty-mark" aria-hidden="true">
            ＋
          </div>
          <div>
            <h2>Начни с одного урока</h2>
            <p>Загрузи скриншот, PDF, презентацию, документ или вставь текст.</p>
            <Link className="inline-link" to="/materials/new">
              Добавить первый материал
            </Link>
          </div>
        </section>
      ) : (
        <StaggerList className="material-list">
          {items.map((item) => (
            <Link key={item.id} className="material-row" to={`/materials/${item.id}`}>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {formatDate(item.lessonDate) ?? formatDate(item.createdAt)} · {item._count.files}{' '}
                  файлов · {item._count.vocabulary} слов · {item._count.grammar} тем
                </small>
              </span>
              <span className="material-status">
                {item.status === 'READY'
                  ? 'Сохранён'
                  : item.status === 'REVIEW'
                    ? 'Проверить'
                    : item.status === 'PROCESSING'
                      ? 'Разбираем'
                      : item.status === 'ERROR'
                        ? 'Ошибка разбора'
                        : 'Черновик'}
              </span>
            </Link>
          ))}
        </StaggerList>
      )}
    </>
  );
}

export function NewMaterialPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [noteText, setNoteText] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData();
    form.set('title', title);
    form.set('lessonDate', lessonDate);
    form.set('deadline', deadline);
    form.set('noteText', noteText);
    for (const file of Array.from(files ?? [])) form.append('files', file);
    try {
      const created = await api<{ id: string }>('/api/materials', { method: 'POST', body: form });
      navigate(`/materials/${created.id}?analyze=1`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить материал');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/materials">
        ← Все материалы
      </Link>
      <p className="eyebrow">НОВЫЙ МАТЕРИАЛ</p>
      <h1 className="page-title">Добавить урок</h1>
      <p className="page-lead">
        Загрузи до пяти файлов или вставь текст. Перед сохранением слов и тем ты сможешь проверить
        результат.
      </p>
      <form className="material-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="material-title">Название урока</label>
        <input
          id="material-title"
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Например, passato prossimo"
        />
        <div className="form-columns">
          <div>
            <label htmlFor="lesson-date">
              Дата урока <span>необязательно</span>
            </label>
            <input
              id="lesson-date"
              type="date"
              value={lessonDate}
              onChange={(event) => setLessonDate(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="deadline">
              Дедлайн <span>необязательно</span>
            </label>
            <input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>
        </div>
        <label htmlFor="material-files">
          Файлы <span>PDF, DOCX, PPTX, JPG, PNG или TXT</span>
        </label>
        <input
          id="material-files"
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.txt"
          onChange={(event) => setFiles(event.target.files)}
        />
        {files && files.length > 0 && (
          <p className="subtle">
            Выбрано:{' '}
            {Array.from(files)
              .map((file) => file.name)
              .join(', ')}
          </p>
        )}
        <label htmlFor="material-text">
          Текст урока <span>можно вместе с файлами</span>
        </label>
        <textarea
          id="material-text"
          rows={8}
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          placeholder="Вставь записи с доски или текст гугл-теста…"
        />
        <p className="subtle">
          Файл до 10 МБ, всего до 20 МБ. Google-тест можно сохранить как PDF, скриншот или
          скопировать текст.
        </p>
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button form-action"
          type="submit"
          disabled={pending || (!noteText.trim() && !files?.length)}
        >
          {pending ? 'Сохраняем…' : 'Добавить и разобрать'}
        </button>
      </form>
    </>
  );
}

export function MaterialDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [vocabulary, setVocabulary] = useState<VocabDraft[]>([]);
  const [grammar, setGrammar] = useState<GrammarDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void api<MaterialDetail>(`/api/materials/${id}`)
      .then((data) => {
        if (active) {
          let saved: Draft | null = null;
          try {
            saved = JSON.parse(
              localStorage.getItem(`lingvoteka-draft-${id}`) ?? 'null',
            ) as Draft | null;
          } catch {
            /* Invalid local draft is ignored. */
          }
          setMaterial(data);
          setVocabulary(
            data.status !== 'READY' && Array.isArray(saved?.vocabulary)
              ? saved.vocabulary
              : (data.analysisDraft?.vocabulary ?? []),
          );
          setGrammar(
            data.status !== 'READY' && Array.isArray(saved?.grammar)
              ? saved.grammar
              : (data.analysisDraft?.grammar ?? []),
          );
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!id || !material || material.status === 'READY' || material.status === 'PROCESSING') return;
    try {
      localStorage.setItem(`lingvoteka-draft-${id}`, JSON.stringify({ vocabulary, grammar }));
    } catch {
      /* Editing remains available without browser storage. */
    }
  }, [id, material?.status, vocabulary, grammar]);
  useEffect(() => {
    if (!id || !material || !new URLSearchParams(window.location.search).has('analyze')) return;
    navigate(`/materials/${id}`, { replace: true });
    void analyze();
    // Initial automatic analysis only after a new material is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, material?.id]);
  useEffect(() => {
    if (!id || material?.status !== 'PROCESSING') return;
    const timer = window.setInterval(() => {
      void api<MaterialDetail>(`/api/materials/${id}`)
        .then((data) => {
          setMaterial(data);
          if (data.status === 'REVIEW') {
            setVocabulary(data.analysisDraft?.vocabulary ?? []);
            setGrammar(data.analysisDraft?.grammar ?? []);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, material?.status]);
  async function analyze() {
    if (!id) return;
    setPending(true);
    setError('');
    try {
      const result = await api<{ draft: Draft }>(`/api/materials/${id}/analyze`, {
        method: 'POST',
      });
      try {
        localStorage.removeItem(`lingvoteka-draft-${id}`);
      } catch {
        /* Optional cache. */
      }
      setMaterial((current) =>
        current
          ? { ...current, status: 'REVIEW', analysisDraft: result.draft, analysisError: null }
          : current,
      );
      setVocabulary(result.draft.vocabulary);
      setGrammar(result.draft.grammar);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Разбор не удался');
      setMaterial((current) => (current ? { ...current, status: 'ERROR' } : current));
    } finally {
      setPending(false);
    }
  }
  async function saveReview() {
    if (!id) return;
    setPending(true);
    setError('');
    try {
      const data = await api<MaterialDetail>(`/api/materials/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocabulary, grammar }),
      });
      try {
        localStorage.removeItem(`lingvoteka-draft-${id}`);
      } catch {
        /* Optional cache. */
      }
      setMaterial(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить');
    } finally {
      setPending(false);
    }
  }
  if (loading) return <p className="subtle">Загружаем материал…</p>;
  if (!material)
    return (
      <>
        <p className="form-message error" role="alert">
          {error || 'Материал не найден'}
        </p>
        <Link to="/materials">К списку</Link>
      </>
    );
  const editable = material.status !== 'READY';
  return (
    <>
      <Link className="back-link" to="/materials">
        ← Все материалы
      </Link>
      <p className="eyebrow">МАТЕРИАЛ УРОКА</p>
      <h1 className="page-title">{material.title}</h1>
      <p className="page-lead">
        {formatDate(material.lessonDate)
          ? `Урок: ${formatDate(material.lessonDate)}.`
          : 'Дата урока не указана.'}{' '}
        {formatDate(material.deadline) ? `Дедлайн: ${formatDate(material.deadline)}.` : ''}
      </p>
      <section className="source-box">
        <h2>Источник</h2>
        {material.noteText && (
          <details>
            <summary>Текст урока</summary>
            <pre>{material.noteText}</pre>
          </details>
        )}
        {material.files.map((file) => (
          <a key={file.id} href={`/api/materials/${id}/files/${file.id}`} download>
            {file.name} <span>↓</span>
          </a>
        ))}
      </section>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {material.analysisError && !error && (
        <p className="form-message error" role="alert">
          {material.analysisError}
        </p>
      )}
      {material.status === 'PROCESSING' ? (
        <div className="theory-placeholder">
          <h2>Разбираем материал</h2>
          <p>Это может занять несколько минут. Можно уйти со страницы и вернуться позже.</p>
        </div>
      ) : editable ? (
        <>
          <div className="review-heading">
            <div>
              <h2>Проверим, что получилось</h2>
              <p>Исправь, удали или добавь записи. AI может ошибаться.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void analyze()}
              disabled={pending}
            >
              {pending ? 'Разбираем материал…' : 'Разобрать ещё раз'}
            </button>
          </div>
          <section className="review-section">
            <div className="section-heading">
              <h3>
                Слова и выражения <span>{vocabulary.length}</span>
              </h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setVocabulary((items) => [...items, emptyVocab()])}
              >
                + Добавить слово
              </button>
            </div>
            {vocabulary.map((item, index) => (
              <div className="review-item" key={index}>
                {item.alreadyInVocabulary && (
                  <p className="source-excerpt">
                    Уже в словаре: сохраним связь с этим материалом, существующий перевод останется.
                  </p>
                )}
                {item.otherMeaningInVocabulary && !item.alreadyInVocabulary && (
                  <p className="source-excerpt">
                    Это написание уже есть с другим переводом. Сохраним отдельное значение и
                    карточку.
                  </p>
                )}
                <div className="form-columns">
                  <label>
                    По-итальянски
                    <input
                      value={item.term}
                      onChange={(event) =>
                        setVocabulary((items) =>
                          items.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  term: event.target.value,
                                  alreadyInVocabulary: false,
                                  otherMeaningInVocabulary: false,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Перевод
                    <input
                      value={item.translation}
                      onChange={(event) =>
                        setVocabulary((items) =>
                          items.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  translation: event.target.value,
                                  alreadyInVocabulary: false,
                                  otherMeaningInVocabulary: false,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Пример
                  <input
                    value={item.example}
                    onChange={(event) =>
                      setVocabulary((items) =>
                        items.map((row, i) =>
                          i === index ? { ...row, example: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                {item.sourceExcerpt && (
                  <p className="source-excerpt">Из материала: {item.sourceExcerpt}</p>
                )}
                <button
                  className="remove-button"
                  type="button"
                  onClick={() => setVocabulary((items) => items.filter((_, i) => i !== index))}
                >
                  Убрать
                </button>
              </div>
            ))}
          </section>
          <section className="review-section">
            <div className="section-heading">
              <h3>
                Грамматические темы <span>{grammar.length}</span>
              </h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setGrammar((items) => [...items, emptyGrammar()])}
              >
                + Добавить тему
              </button>
            </div>
            {grammar.map((item, index) => (
              <div className="review-item" key={index}>
                <label>
                  Название
                  <input
                    value={item.title}
                    onChange={(event) =>
                      setGrammar((items) =>
                        items.map((row, i) =>
                          i === index ? { ...row, title: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Краткое объяснение
                  <textarea
                    rows={3}
                    value={item.summary}
                    onChange={(event) =>
                      setGrammar((items) =>
                        items.map((row, i) =>
                          i === index ? { ...row, summary: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                {item.sourceExcerpt && (
                  <p className="source-excerpt">Из материала: {item.sourceExcerpt}</p>
                )}
                <button
                  className="remove-button"
                  type="button"
                  onClick={() => setGrammar((items) => items.filter((_, i) => i !== index))}
                >
                  Убрать
                </button>
              </div>
            ))}
          </section>
          <button
            className="primary-button form-action"
            type="button"
            onClick={() => void saveReview()}
            disabled={pending}
          >
            {pending ? 'Сохраняем…' : 'Сохранить слова и темы'}
          </button>
        </>
      ) : (
        <>
          <div className="review-heading">
            <div>
              <h2>Сохранённые записи</h2>
              <p>Они доступны для повторения и практики.</p>
            </div>
          </div>
          <section className="review-section">
            <h3>Слова и выражения</h3>
            {material.vocabulary.length ? (
              material.vocabulary.map(({ vocabItem }) => (
                <div className="saved-row" key={vocabItem.id}>
                  <strong>{vocabItem.term}</strong>
                  <span>{vocabItem.translation}</span>
                </div>
              ))
            ) : (
              <p className="subtle">Слов пока нет.</p>
            )}
          </section>
          <section className="review-section">
            <h3>Грамматические темы</h3>
            {material.grammar.length ? (
              material.grammar.map(({ grammarTopic }) => (
                <div className="saved-row" key={grammarTopic.id}>
                  <strong>{grammarTopic.title}</strong>
                  <span>{grammarTopic.summary}</span>
                </div>
              ))
            ) : (
              <p className="subtle">Тем пока нет.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
