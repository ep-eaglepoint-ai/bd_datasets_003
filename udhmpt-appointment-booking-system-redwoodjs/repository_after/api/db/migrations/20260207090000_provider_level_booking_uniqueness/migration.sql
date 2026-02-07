-- Update unique index to enforce provider-level booking uniqueness
DROP INDEX IF EXISTS "Booking_serviceId_startUtc_capacitySlot_key";
DROP INDEX IF EXISTS "Booking_providerId_startUtc_capacitySlot_key";
CREATE UNIQUE INDEX "Booking_providerId_startUtc_capacitySlot_key" ON "Booking"("providerId", "startUtc", "capacitySlot");
