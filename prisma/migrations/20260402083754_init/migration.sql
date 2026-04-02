-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT,
    "email" TEXT,
    "telegramChatId" TEXT,
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mutedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertPreferences" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "warningThreshold" DECIMAL NOT NULL DEFAULT 1.50,
    "dangerThreshold" DECIMAL NOT NULL DEFAULT 1.20,
    "criticalThreshold" DECIMAL NOT NULL DEFAULT 1.05,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramLink" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "chatId" TEXT,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitoredPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collateralSymbol" TEXT NOT NULL,
    "debtSymbol" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitoredPair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collateralSymbol" TEXT NOT NULL,
    "debtSymbol" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "healthRatio" DECIMAL NOT NULL,
    "message" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TelegramLink_userId_idx" ON "TelegramLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredPair_userId_collateralSymbol_debtSymbol_key" ON "MonitoredPair"("userId", "collateralSymbol", "debtSymbol");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");
