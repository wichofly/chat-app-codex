CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TABLE "Message" (
  "id" UUID NOT NULL,
  "chatId" UUID NOT NULL,
  "role" "MessageRole" NOT NULL,
  "sequence" INTEGER NOT NULL,
  "contentJson" JSONB,
  "plainText" TEXT NOT NULL DEFAULT '',
  "status" "MessageStatus" NOT NULL,
  "modelId" TEXT,
  "clientMessageId" UUID,
  "generationId" UUID,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Message_chatId_sequence_key" ON "Message"("chatId", "sequence");
CREATE UNIQUE INDEX "Message_chatId_clientMessageId_key" ON "Message"("chatId", "clientMessageId");
CREATE INDEX "Message_chatId_status_idx" ON "Message"("chatId", "status");
CREATE TABLE "GenerationUsage" (
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "GenerationUsage_pkey" PRIMARY KEY ("userId", "day")
);
ALTER TABLE "GenerationUsage" ADD CONSTRAINT "GenerationUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
