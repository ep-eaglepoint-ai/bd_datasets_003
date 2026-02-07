-- Prevent overlapping bookings across services while allowing capacity slots
-- for the same service. Enforced at the DB layer to protect against races.

DROP TRIGGER IF EXISTS booking_overlap_guard_insert;
DROP TRIGGER IF EXISTS booking_overlap_guard_update;

CREATE TRIGGER booking_overlap_guard_insert
BEFORE INSERT ON "Booking"
WHEN NEW."canceledAt" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Overlapping booking')
  WHERE EXISTS (
    SELECT 1
    FROM "Booking" b
    WHERE b."providerId" = NEW."providerId"
      AND b."canceledAt" IS NULL
      AND b."startUtc" < NEW."endUtc"
      AND b."endUtc" > NEW."startUtc"
      AND (
        b."serviceId" != NEW."serviceId"
        OR COALESCE(b."capacitySlot", -1) = COALESCE(NEW."capacitySlot", -1)
      )
  );
END;

CREATE TRIGGER booking_overlap_guard_update
BEFORE UPDATE OF "startUtc", "endUtc", "serviceId", "capacitySlot", "canceledAt" ON "Booking"
WHEN NEW."canceledAt" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Overlapping booking')
  WHERE EXISTS (
    SELECT 1
    FROM "Booking" b
    WHERE b."providerId" = NEW."providerId"
      AND b."id" != NEW."id"
      AND b."canceledAt" IS NULL
      AND b."startUtc" < NEW."endUtc"
      AND b."endUtc" > NEW."startUtc"
      AND (
        b."serviceId" != NEW."serviceId"
        OR COALESCE(b."capacitySlot", -1) = COALESCE(NEW."capacitySlot", -1)
      )
  );
END;
