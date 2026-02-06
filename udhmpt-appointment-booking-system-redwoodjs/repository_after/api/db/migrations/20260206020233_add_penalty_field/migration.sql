-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "providerId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "startUtc" DATETIME NOT NULL,
    "endUtc" DATETIME NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "capacitySlot" INTEGER DEFAULT 0,
    "reference" TEXT NOT NULL,
    "canceledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "penaltyFeeCents" INTEGER DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("canceledAt", "capacitySlot", "createdAt", "customerEmail", "endUtc", "id", "notes", "providerId", "reference", "serviceId", "startUtc", "status", "updatedAt", "userId", "version") SELECT "canceledAt", "capacitySlot", "createdAt", "customerEmail", "endUtc", "id", "notes", "providerId", "reference", "serviceId", "startUtc", "status", "updatedAt", "userId", "version" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");
CREATE UNIQUE INDEX "Booking_serviceId_startUtc_capacitySlot_key" ON "Booking"("serviceId", "startUtc", "capacitySlot");
CREATE TABLE "new_ProviderProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "maxBookingsPerDay" INTEGER,
    "cancellationFeeCents" INTEGER DEFAULT 0,
    "rescheduleFeeCents" INTEGER DEFAULT 0,
    "penaltiesApplyForLateCancel" BOOLEAN NOT NULL DEFAULT false,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
    "rescheduleWindowHours" INTEGER NOT NULL DEFAULT 24,
    "bookingLeadTimeHours" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProviderProfile" ("bio", "cancellationFeeCents", "cancellationWindowHours", "createdAt", "id", "maxBookingsPerDay", "name", "penaltiesApplyForLateCancel", "rescheduleFeeCents", "rescheduleWindowHours", "timezone", "updatedAt", "userId") SELECT "bio", "cancellationFeeCents", "cancellationWindowHours", "createdAt", "id", "maxBookingsPerDay", "name", "penaltiesApplyForLateCancel", "rescheduleFeeCents", "rescheduleWindowHours", "timezone", "updatedAt", "userId" FROM "ProviderProfile";
DROP TABLE "ProviderProfile";
ALTER TABLE "new_ProviderProfile" RENAME TO "ProviderProfile";
CREATE UNIQUE INDEX "ProviderProfile_userId_key" ON "ProviderProfile"("userId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
