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
    "capacitySlot" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "canceledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("canceledAt", "createdAt", "customerEmail", "endUtc", "id", "notes", "providerId", "reference", "serviceId", "startUtc", "status", "updatedAt", "userId", "version") SELECT "canceledAt", "createdAt", "customerEmail", "endUtc", "id", "notes", "providerId", "reference", "serviceId", "startUtc", "status", "updatedAt", "userId", "version" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");
CREATE UNIQUE INDEX "Booking_providerId_startUtc_capacitySlot_key" ON "Booking"("providerId", "startUtc", "capacitySlot");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
