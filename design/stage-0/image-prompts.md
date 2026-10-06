# Промпты визуальных концептов

Статические концепты 01 и 02 получены встроенным `image_gen`. Исходные PNG сохранены рядом с этим файлом. Третий макет подготовлен вручную как SVG после сетевого сбоя генерации изображения.

## 01 — Сегодня и повторение

```text
Create a high-fidelity UI DESIGN PRESENTATION IMAGE for Lingvoteka, a personal Italian learning app with Russian interface. This is a static design proposal, not app code. Use case: ui-mockup. Large landscape canvas 3200x2000. Extremely sharp legible Cyrillic typography.
ART DIRECTION: sophisticated warm editorial study notebook. Background #F7F4EE, surfaces #FFFDFA, ink #26232A, muted #68636C, plum accent #603A70, pale plum #EEE5F1. One accent. Flat clean UI, fine borders, little shadow, generous spacing, no gradients, no 3D decoration, no flags, no stock photos, no childish mascot. Elegant Lora-like serif large headings, clean Golos-like sans serif controls. Italian phrases may be serif italic. Design like a meticulous professional Figma presentation.
LAYOUT: top small label "LINGVOTEKA / КОНЦЕПЦИЯ 01" and title "Немного итальянского каждый день". Below a large desktop app screenshot occupying left 72% and one mobile review screen occupying right 23%. No devices or browser chrome. Label desktop "01 / Сегодня", mobile "02 / Повторение". Keep all within canvas with 70px margins. Bottom thin line with palette swatches and labels "Тёплый фон", "Сливовый акцент", "Типографика". All numbers and content are demo.
DESKTOP SCREEN:
Left 200px sidebar in warm ivory: wordmark "lingvoteka" in serif and tiny abstract bookmark mark; nav "Сегодня" active pale plum rounded pill, "Материалы", "Словарь", "Грамматика"; bottom small avatar Д and "Профиль". Thin divider.
Main top right outline button "+ Добавить материал". Tiny uppercase "BUONGIORNO!" above main 48px serif title "Немного итальянского сегодня". Subheading "Слова и темы из твоих уроков — в одном месте."
Main asymmetric composition: a dominant plum panel taking 60% of row, elegant white text "ПОВТОРЕНИЕ", very large "12 карточек", line "Около 5 минут", white button "Начать повторение" with arrow, quiet footer "Новых сегодня: до 5". The other 40% is light uncluttered ruled editorial section "Продолжить тему", large serif "Passato prossimo", text "Как говорить о завершённых событиях", link "Открыть тему →", small well typeset Italian example "Ieri ho comprato un libro."
Below main area heading "Последние материалы" and small link "Все материалы →". Two fine-rule rows, not a grid of cards: document glyph, "На вокзале", "Сегодня · PDF", pale badge "Готово", arrow; second "Урок 12 — прошедшее время", "Вчера · 3 файла", badge "Проверить разбор", arrow.
MOBILE SCREEN:
Cream rounded rectangle, clearly mobile layout with app content. Header "Повторение" and close X, thin progress 3 of 12 and text "3 из 12". Small label "ВСПОМНИ ПО-ИТАЛЬЯНСКИ". Large serif Russian prompt "ехать поездом". Line divider then answer reveal already visible in pale lavender panel "prendere il treno", Italian example "Domani devo prendere il treno per Roma.", Russian text "Завтра мне нужно ехать поездом в Рим." tiny link "Из материала «На вокзале»". Footer above buttons "Насколько легко вспомнилось?" and 2x2 outlined buttons exact: "Не вспомнила", "Трудно", "Хорошо", "Легко"; good button plum. No invented interval numbers. Screen visually airy with thumb-friendly buttons. Put small caption below mobile "Ответ раскрыт • оценка по памяти".
Ensure spellings correct and enough whitespace, realistic product design, hierarchy, excellent editorial typography. No charts, achievements, paid plans, language level selector or notifications.
```

## 02 — Добавление и проверка материала

```text
Use case: ui-mockup. Create a polished static DESIGN PRESENTATION board for Lingvoteka. Large portrait canvas 2400x3000, crisp legible Russian text. Show two complete desktop product UI screenshots stacked vertically, ample white margin, no device frames or browser chrome. Header "LINGVOTEKA / КОНЦЕПЦИЯ 01", large editorial title "От материала — к своим словам". First screenshot label "03 / Добавить материал", second "04 / Проверить разбор". Each screenshot roughly 2100x1150.
STYLE: warm contemporary editorial study notebook, #F7F4EE background, #FFFDFA surfaces, #26232A text, #68636C muted, single plum #603A70 accent, soft #EEE5F1. Fine borders, 12-20px corners, lots of whitespace, minimal shadows, no gradient, no decoration or photos. Lora-like serif titles and Italian words, Golos-like sans serif body and all controls. Repeated left narrow sidebar wordmark "lingvoteka" and bookmark glyph; four nav rows "Сегодня", "Материалы" active pale plum, "Словарь", "Грамматика", bottom "Профиль". Keep typography large and exact.
SCREEN 1 ADD:
Main content header "Что было на уроке?" with subtitle "Загрузи материалы — соберём слова и темы вместе." 
Main wide form 65% plus right 30% note.
Segmented control "Файлы" active / "Текст".
Drop area dotted border, upload icon, "Перетащи файлы сюда", outline button "Выбрать файлы", small "PDF, PPTX, DOCX, JPG, PNG".
Below selected-file row "На вокзале.pdf", small "2 страницы", remove x.
Below fields in clear order: "Название" input "На вокзале", then two fields in same row "Дата урока" input "2 октября 2026" and "Дедлайн · необязательно" input "Выбрать дату".
Bottom plum primary button "Разобрать материал →".
Right note small label "КАК ЭТО РАБОТАЕТ", numbered 1 "Прочитаем материал", 2 "Найдём слова и темы", 3 "Ты проверишь результат"; below fine divider text "Онлайн-доска или Google-тест? Подойдёт PDF, скриншот или скопированный текст."
Do not add web link input, notification toggle or language level.
SCREEN 2 REVIEW:
Header "Проверим, что получилось", subtitle "На вокзале.pdf".
Workspace split left 42% source preview / right 58% results.
Left source card toolbar "Источник" and "1 / 2", white paper preview titled "Alla stazione" and source Italian sentences with subtle pale lavender highlight around phrase:
"Vorrei un biglietto per Roma."
"Domani devo prendere il treno."
"A che ora parte il treno?"
Small footer "Выбери слово справа, чтобы увидеть контекст".
Right tabs "Слова · 4" active and "Грамматика · 1"; small "Выбрать все". Exactly FOUR list rows with checkboxes; first THREE checked and fourth unchecked. Each row with a subtle edit pencil icon.
Row1 bold italic "il biglietto", translation "билет", badge "Новое".
Row2 "prendere il treno", translation "ехать поездом", badge "Новое".
Row3 "partire", translation "отправляться, уезжать", badge "Новое".
Row4 unchecked "la stazione", translation "вокзал, станция", badge "Уже в словаре".
Thin inline link "+ Добавить слово".
Bottom fixed footer across right workspace shows "Выбрано: 3 слова, 1 тема" and plum button "Сохранить выбранное".
Avoid any extra words, made up confidence percentages, tiny unreadable text, repeated gibberish. Clear real usable product composition. Bottom board caption "AI предлагает. Ты решаешь, что учить."
```

