CREATE TABLE "ShareLink" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShareLink_chatId_key" ON "ShareLink"("chatId");
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Chat_userId_updatedAt_idx";
CREATE INDEX "Chat_userId_updatedAt_id_idx" ON "Chat"("userId", "updatedAt", "id");
