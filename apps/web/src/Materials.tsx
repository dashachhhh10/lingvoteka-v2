import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { ActionLink, Button } from './components/ui/button';
import { SelectField } from './components/ui/fields';
import { StaggerList } from './Motion';
import { partsOfSpeech, semanticTopics } from './vocabulary-categories';

type VocabDraft = {
  term: string;
  translation: string;
  example: string;
  sourceExcerpt: string;
  partOfSpeech?: string;
  semanticTopic?: string;
  alreadyInVocabulary?: boolean;
  otherMeaningInVocabulary?: boolean;
  existingTranslation?: string;
  allowNewMeaning?: boolean;
};
type GrammarDraft = {
  title: string;
  summary: string;
  sourceExcerpt: string;
  alreadyInGrammar?: boolean;
};
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
  partOfSpeech: '',
  semanticTopic: '',
});
const emptyGrammar = (): GrammarDraft => ({ title: '', summary: '', sourceExcerpt: '' });

function DeleteMaterialButton({
  id,
  title,
  onDeleted,
}: {
  id: string;
  title: string;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await api(`/api/materials/${id}`, { method: 'DELETE' });
      try {
        localStorage.removeItem(`lingvoteka-draft-${id}`);
      } catch {
        /* Optional draft cache. */
      }
      dialog.current?.close();
      onDeleted?.();
      void Promise.all(
        ['materials', 'vocabulary', 'grammar', 'reviews'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить материал');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        className="shrink-0"
        aria-label={`Удалить материал: ${title}`}
        onClick={() => {
          setError('');
          dialog.current?.showModal();
        }}
      >
        Удалить
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto max-h-[calc(100dvh-40px)] w-[calc(100%-40px)] max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface p-6 text-ink backdrop:bg-black/40 sm:p-8"
      >
        <h2 id={headingId} className="m-0 text-2xl font-medium tracking-tight">
          Удалить материал?
        </h2>
        <p className="mt-4 break-words font-medium">{title}</p>
        <p className="text-sm leading-relaxed text-muted">
          Удалим материал и его файлы, а также слова, карточки, темы и результаты, которые относятся
          только к нему. Общие записи из других материалов и самостоятельные записи сохранятся.
        </p>
        <p className="text-sm text-muted">Отменить удаление не получится.</p>
        {error && (
          <p role="alert" className="form-message error">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => dialog.current?.close()}>
            Оставить материал
          </Button>
          <Button disabled={pending} onClick={() => void remove()}>
            {pending ? 'Удаляем…' : 'Удалить материал'}
          </Button>
        </div>
      </dialog>
    </>
  );
}

export function MaterialsPage() {
  const {
    data: items = [],
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ['materials'],
    queryFn: () => api<MaterialListItem[]>('/api/materials'),
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'PROCESSING') ? 3_000 : false,
  });
  const error = loadError instanceof Error ? loadError.message : '';
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ТВОИ МАТЕРИАЛЫ</p>
          <h1 className="page-title">Материалы</h1>
          <p className="page-lead">
            Добавляй файлы или текст, чтобы собрать слова и темы для практики.
          </p>
        </div>
        <ActionLink to="/materials/new">Добавить материал</ActionLink>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="subtle page-vine-loading">Загружаем материалы…</p>
      ) : loadError && !items.length ? null : items.length === 0 ? (
        <section className="empty-section">
          <div className="empty-mark" aria-hidden="true">
            ＋
          </div>
          <div>
            <h2>Добавь первый материал</h2>
            <p>Загрузи скриншот, PDF, презентацию, документ или вставь текст.</p>
            <Link className="inline-link" to="/materials/new">
              Добавить первый материал
            </Link>
          </div>
        </section>
      ) : (
        <StaggerList className="material-list">
          {items.map((item) => (
            <article key={item.id} className="flex items-center gap-2 border-b border-line">
              <Link className="material-row min-w-0 flex-1 !border-0" to={`/materials/${item.id}`}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {formatDate(item.lessonDate) ?? formatDate(item.createdAt)} ·{' '}
                    {item._count.files} файлов · {item._count.vocabulary} слов ·{' '}
                    {item._count.grammar} тем
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
              <DeleteMaterialButton id={item.id} title={item.title} />
            </article>
          ))}
        </StaggerList>
      )}
    </>
  );
}

export function NewMaterialPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [autoTitle, setAutoTitle] = useState(false);
  const [lessonDate, setLessonDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [noteText, setNoteText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
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
    for (const file of files) form.append('files', file);
    try {
      const created = await api<{ id: string }>('/api/materials', { method: 'POST', body: form });
      void queryClient.invalidateQueries({ queryKey: ['materials'] });
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
      <h1 className="page-title">Добавить материал</h1>
      <p className="page-lead">
        Загрузи до пяти файлов или вставь текст. Перед сохранением слов и тем ты сможешь проверить
        результат.
      </p>
      <form className="material-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="material-title">
          Название материала <span>подставим из первого файла, можно изменить</span>
        </label>
        <input
          id="material-title"
          required
          maxLength={160}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setAutoTitle(false);
          }}
          placeholder="Выбери файл или введи название"
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
        <div className="file-picker-row">
          <input
            ref={fileInputRef}
            id="material-files"
            className="file-picker-input"
            type="file"
            tabIndex={-1}
            multiple
            accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.txt"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              setFiles(selected);
              if (selected[0] && (!title.trim() || autoTitle)) {
                const fileName = selected[0].name;
                const dot = fileName.lastIndexOf('.');
                setTitle((dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 160));
                setAutoTitle(true);
              }
            }}
          />
          <button
            className="file-picker-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-describedby="file-selection-status"
          >
            Выбрать файлы
          </button>
          <span className="file-picker-status" id="file-selection-status" role="status">
            {files.length === 0
              ? 'Файлы не выбраны'
              : files.length === 1
                ? 'Выбран 1 файл'
                : `Выбрано файлов: ${files.length}`}
          </span>
        </div>
        {files.length > 0 && (
          <ul className="selected-file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>{file.name}</li>
            ))}
          </ul>
        )}
        <label htmlFor="material-text">
          Текст <span>фраза, записи с урока или текст вместе с файлами</span>
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
          disabled={pending || (!noteText.trim() && files.length === 0)}
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
  const queryClient = useQueryClient();
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [vocabulary, setVocabulary] = useState<VocabDraft[]>([]);
  const [grammar, setGrammar] = useState<GrammarDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const knownVocabulary = useQuery({
    queryKey: ['vocabulary'],
    queryFn: () => api<{ term: string; translation: string }[]>('/api/vocabulary'),
    enabled: Boolean(material && material.status !== 'READY'),
  });
  const knownGrammar = useQuery({
    queryKey: ['grammar'],
    queryFn: () => api<{ title: string }[]>('/api/grammar'),
    enabled: Boolean(material && material.status !== 'READY'),
  });
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
            void queryClient.invalidateQueries({ queryKey: ['materials'] });
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
      await api<{ status: 'PROCESSING' }>(`/api/materials/${id}/analyze`, {
        method: 'POST',
      });
      try {
        localStorage.removeItem(`lingvoteka-draft-${id}`);
      } catch {
        /* Optional cache. */
      }
      setMaterial((current) =>
        current
          ? { ...current, status: 'PROCESSING', analysisDraft: null, analysisError: null }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['materials'] });
      setVocabulary([]);
      setGrammar([]);
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
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['materials'] }),
        queryClient.invalidateQueries({ queryKey: ['vocabulary'] }),
        queryClient.invalidateQueries({ queryKey: ['grammar'] }),
        queryClient.invalidateQueries({ queryKey: ['reviews'] }),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить');
    } finally {
      setPending(false);
    }
  }
  if (loading) return <p className="subtle page-vine-loading">Загружаем материал…</p>;
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
  const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
  const displayedVocabulary = vocabulary.map((item) => {
    if (!knownVocabulary.data) return item;
    const matches = knownVocabulary.data.filter(
      (word) => normalized(word.term) === normalized(item.term),
    );
    const exact = matches.find(
      (word) => normalized(word.translation) === normalized(item.translation),
    );
    return {
      ...item,
      alreadyInVocabulary: Boolean(exact),
      otherMeaningInVocabulary: !exact && matches.length > 0,
      existingTranslation: (exact ?? matches[0])?.translation,
    };
  });
  const displayedGrammar = grammar.map((item) =>
    knownGrammar.data
      ? {
          ...item,
          alreadyInGrammar: knownGrammar.data.some(
            (topic) => normalized(topic.title) === normalized(item.title),
          ),
        }
      : item,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="back-link" to="/materials">
          ← Все материалы
        </Link>
        <DeleteMaterialButton
          id={material.id}
          title={material.title}
          onDeleted={() => navigate('/materials', { replace: true })}
        />
      </div>
      <p className="eyebrow">МАТЕРИАЛ</p>
      <h1 className="page-title">{material.title}</h1>
      {(material.lessonDate || material.deadline) && (
        <p className="page-lead">
          {formatDate(material.lessonDate) ? `Урок: ${formatDate(material.lessonDate)}.` : ''}{' '}
          {formatDate(material.deadline) ? `Дедлайн: ${formatDate(material.deadline)}.` : ''}
        </p>
      )}
      <section className="source-box">
        <h2>Источник</h2>
        {material.noteText && (
          <details>
            <summary>Исходный текст</summary>
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
          <p>
            Распознаём содержимое файлов и собираем слова и темы. Результат появится здесь
            автоматически; можно уйти со страницы и вернуться позже.
          </p>
        </div>
      ) : editable ? (
        <>
          <div className="review-heading">
            <div>
              <h2>Проверим, что получилось</h2>
              <p>
                {material.status === 'REVIEW'
                  ? `Найдено слов: ${vocabulary.length}, тем: ${grammar.length}. Проверь переводы, убери лишнее и сохрани выбранное. Из сохранённых слов появятся карточки.`
                  : 'Добавь слова и темы вручную или запусти разбор ещё раз.'}
              </p>
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
            {displayedVocabulary.map((item, index) => (
              <div className="review-item" key={index}>
                {item.alreadyInVocabulary && (
                  <p className="source-excerpt">
                    Уже в словаре: сохраним связь с этим материалом, существующий перевод останется.
                  </p>
                )}
                {item.otherMeaningInVocabulary && !item.alreadyInVocabulary && (
                  <div className="mb-4 rounded-2xl border border-line bg-olive-soft p-4 text-sm">
                    <p className="mt-0">
                      Слово уже есть в словаре
                      {item.existingTranslation ? `: «${item.existingTranslation}»` : ''}. По
                      умолчанию свяжем с ним этот материал, без второй карточки.
                    </p>
                    <label className="!flex min-h-11 cursor-pointer items-center gap-3 !font-normal">
                      <input
                        className="!m-0 !size-4 !min-h-0 shrink-0 !rounded !p-0 accent-[var(--action)]"
                        type="checkbox"
                        checked={item.allowNewMeaning ?? false}
                        onChange={(event) =>
                          setVocabulary((items) =>
                            items.map((row, i) =>
                              i === index ? { ...row, allowNewMeaning: event.target.checked } : row,
                            ),
                          )
                        }
                      />
                      Сохранить как новое значение
                    </label>
                  </div>
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
                                  allowNewMeaning: false,
                                  existingTranslation: undefined,
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
                                  allowNewMeaning: false,
                                  existingTranslation: undefined,
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
                <div className="form-columns">
                  <label>
                    Часть речи
                    <SelectField
                      value={item.partOfSpeech ?? ''}
                      onChange={(event) =>
                        setVocabulary((items) =>
                          items.map((row, i) =>
                            i === index ? { ...row, partOfSpeech: event.target.value } : row,
                          ),
                        )
                      }
                    >
                      <option value="">Определим после сохранения</option>
                      {partsOfSpeech.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </SelectField>
                  </label>
                  <label>
                    Лексическая тема
                    <SelectField
                      value={
                        item.semanticTopic === 'Здоровье'
                          ? 'Тело и здоровье'
                          : (item.semanticTopic ?? '')
                      }
                      onChange={(event) =>
                        setVocabulary((items) =>
                          items.map((row, i) =>
                            i === index ? { ...row, semanticTopic: event.target.value } : row,
                          ),
                        )
                      }
                    >
                      <option value="">Определим после сохранения</option>
                      {semanticTopics.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </SelectField>
                  </label>
                </div>
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
            {displayedGrammar.map((item, index) => (
              <div className="review-item" key={index}>
                {item.alreadyInGrammar && (
                  <p className="source-excerpt">
                    Тема уже есть: добавим этот материал как источник, без второй темы и потери
                    прогресса.
                  </p>
                )}
                <label>
                  Название
                  <input
                    value={item.title}
                    onChange={(event) =>
                      setGrammar((items) =>
                        items.map((row, i) =>
                          i === index
                            ? { ...row, title: event.target.value, alreadyInGrammar: false }
                            : row,
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
            {pending ? 'Добавляем…' : 'Добавить'}
          </button>
        </>
      ) : (
        <>
          <div className="review-heading">
            <div>
              <h2>Сохранённые записи</h2>
              <p>Слова этого материала можно повторять отдельно от общей очереди.</p>
            </div>
            {material.vocabulary.length > 0 && (
              <ActionLink to={`/review?materialId=${encodeURIComponent(material.id)}`}>
                Карточки этого материала
              </ActionLink>
            )}
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
