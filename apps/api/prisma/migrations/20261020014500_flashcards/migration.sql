CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "vocabItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'IT_TO_RU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- Each saved word starts with one Italian-to-Russian card. Keep existing
-- review schedules by linking their state to the new card.
INSERT INTO "Flashcard" ("id", "vocabItemId", "kind", "createdAt")
SELECT 'card_' || "id", "id", 'IT_TO_RU', "createdAt"
FROM "VocabItem";

CREATE UNIQUE INDEX "Flashcard_vocabItemId_kind_key"
    ON "Flashcard"("vocabItemId", "kind");

ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_vocabItemId_fkey"
    FOREIGN KEY ("vocabItemId") REFERENCES "VocabItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewState" ADD COLUMN "flashcardId" TEXT;

UPDATE "ReviewState"
SET "flashcardId" = 'card_' || "vocabItemId";

ALTER TABLE "ReviewState" ALTER COLUMN "flashcardId" SET NOT NULL;

DROP INDEX "ReviewState_userId_vocabItemId_key";
ALTER TABLE "ReviewState" DROP CONSTRAINT "ReviewState_vocabItemId_fkey";
ALTER TABLE "ReviewState" DROP COLUMN "vocabItemId";

CREATE UNIQUE INDEX "ReviewState_userId_flashcardId_key"
    ON "ReviewState"("userId", "flashcardId");

ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_flashcardId_fkey"
    FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
