# Аватар Lingvoteka

`lingvoteka-avatar-v1.png` — исходный логотип, созданный встроенным `image_gen` 25 октября 2026 года. `lingvoteka-avatar-v1.jpg` — тот же рисунок, конвертированный в JPEG для Telegram Bot API, без изменения композиции. Тёмная зелень, сливочный знак карточки в форме L, лимон и мягкий лист. Большие поля сохраняют знак при круглом кадрировании.

Аватар применяется сервером из `telegram-brand.ts`. Хеш JPEG хранится отдельно в `TelegramBotProfile`, поэтому обычные перезапуски не загружают его заново. PNG можно использовать как исходник для будущих изменений; не перезаписывать автоматически при новой генерации.

Промпт генерации:

> Use case: logo-brand. Create ONE polished flat logo for Lingvoteka, a warm Italian language learning app, used as a Telegram bot avatar. Square full-bleed deep forest green background #273b31. Center a distinctive, simple, cream-colored folded flashcard/bookmark monogram suggesting an L, with one small warm lemon-yellow lemon and a single soft sage leaf nestled at the upper right of the mark. The lemon should be graphic, elegant and understated, integrating with the flashcard silhouette, not a cartoon character. Palette: warm ivory #f8f8f2, sage #b5d1a7, muted lemon yellow #e1c975, forest #273b31. Premium editorial stationery identity, crisp vector-like curves, subtle optical asymmetry, restrained proportions, flat solid colors. Mark occupies about 60% of square width, broad safe margins for a circular Telegram crop; readable at 40px. No text, no letters spelled as a word, no border, no mockup, no gradients, no shadows, no 3D, no texture, no extra objects. Output just one final logo avatar image.
