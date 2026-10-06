ALTER TABLE "VocabItem" ADD COLUMN "normalizedMeaning" TEXT;

UPDATE "VocabItem"
SET "normalizedMeaning" = lower(regexp_replace(btrim("translation"), '[[:space:]]+', ' ', 'g'));

ALTER TABLE "VocabItem" ALTER COLUMN "normalizedMeaning" SET NOT NULL;

DROP INDEX "VocabItem_ownerId_normalized_key";
CREATE UNIQUE INDEX "VocabItem_ownerId_normalized_normalizedMeaning_key"
  ON "VocabItem"("ownerId", "normalized", "normalizedMeaning");
CREATE INDEX "VocabItem_ownerId_normalized_idx" ON "VocabItem"("ownerId", "normalized");
