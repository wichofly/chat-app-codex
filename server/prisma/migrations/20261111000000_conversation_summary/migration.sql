ALTER TABLE "Chat" ADD COLUMN "contextSummary" TEXT,
ADD COLUMN "contextThroughSequence" INTEGER NOT NULL DEFAULT 0;
