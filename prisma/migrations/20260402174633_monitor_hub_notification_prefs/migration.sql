-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertPreferences" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "warningThreshold" DECIMAL NOT NULL DEFAULT 1.50,
    "dangerThreshold" DECIMAL NOT NULL DEFAULT 1.20,
    "criticalThreshold" DECIMAL NOT NULL DEFAULT 1.05,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "autoProtectEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyContactEmail" TEXT,
    "notifyPositions" BOOLEAN NOT NULL DEFAULT true,
    "notifyYield" BOOLEAN NOT NULL DEFAULT false,
    "notifyLiquidation" BOOLEAN NOT NULL DEFAULT true,
    "notifyMarket" BOOLEAN NOT NULL DEFAULT false,
    "lastMarketDigestAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AlertPreferences" ("autoProtectEnabled", "cooldownMinutes", "createdAt", "criticalThreshold", "dangerThreshold", "emailEnabled", "telegramEnabled", "updatedAt", "userId", "warningThreshold") SELECT "autoProtectEnabled", "cooldownMinutes", "createdAt", "criticalThreshold", "dangerThreshold", "emailEnabled", "telegramEnabled", "updatedAt", "userId", "warningThreshold" FROM "AlertPreferences";
DROP TABLE "AlertPreferences";
ALTER TABLE "new_AlertPreferences" RENAME TO "AlertPreferences";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
