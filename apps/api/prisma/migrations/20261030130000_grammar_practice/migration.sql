ALTER TABLE "GrammarTopic" ADD COLUMN "practiceStatus" TEXT NOT NULL DEFAULT 'NOT_GENERATED', ADD COLUMN "practiceError" TEXT;
UPDATE "GrammarTopic" SET "practiceStatus" = 'READY' WHERE EXISTS (SELECT 1 FROM "GrammarExercise" WHERE "topicId" = "GrammarTopic"."id");
