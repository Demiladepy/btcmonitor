-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('warning', 'danger', 'critical');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT,
    "email" TEXT,
    "telegramChatId" TEXT,
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertPreferences" (
    "userId" TEXT NOT NULL,
    "warningThreshold" DECIMAL(65,30) NOT NULL DEFAULT 1.50,
    "dangerThreshold" DECIMAL(65,30) NOT NULL DEFAULT 1.20,
    "criticalThreshold" DECIMAL(65,30) NOT NULL DEFAULT 1.05,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "autoProtectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyContactEmail" TEXT,
    "notifyPositions" BOOLEAN NOT NULL DEFAULT true,
    "notifyYield" BOOLEAN NOT NULL DEFAULT false,
    "notifyLiquidation" BOOLEAN NOT NULL DEFAULT true,
    "notifyMarket" BOOLEAN NOT NULL DEFAULT false,
    "lastMarketDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TelegramLink" (
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "chatId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "MonitoredPair" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collateralSymbol" TEXT NOT NULL,
    "debtSymbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoredPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collateralSymbol" TEXT NOT NULL,
    "debtSymbol" TEXT NOT NULL,
    "level" "AlertLevel" NOT NULL,
    "healthRatio" DECIMAL(65,30) NOT NULL,
    "message" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramLink_userId_idx" ON "TelegramLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredPair_userId_collateralSymbol_debtSymbol_key" ON "MonitoredPair"("userId", "collateralSymbol", "debtSymbol");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AlertPreferences" ADD CONSTRAINT "AlertPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredPair" ADD CONSTRAINT "MonitoredPair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
