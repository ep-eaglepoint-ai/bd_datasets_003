-- Update overlap guard to include service buffer times for both existing and new bookings.

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
    JOIN "Service" sb ON sb."id" = b."serviceId"
    JOIN "Service" sn ON sn."id" = NEW."serviceId"
    WHERE b."providerId" = NEW."providerId"
      AND b."canceledAt" IS NULL
      AND (
        julianday(b."startUtc") - (COALESCE(sb."bufferBeforeMinutes", 0) / 1440.0)
          < julianday(NEW."endUtc") + (COALESCE(sn."bufferAfterMinutes", 0) / 1440.0)
      )
      AND (
        julianday(b."endUtc") + (COALESCE(sb."bufferAfterMinutes", 0) / 1440.0)
          > julianday(NEW."startUtc") - (COALESCE(sn."bufferBeforeMinutes", 0) / 1440.0)
      )
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
    JOIN "Service" sb ON sb."id" = b."serviceId"
    JOIN "Service" sn ON sn."id" = NEW."serviceId"
    WHERE b."providerId" = NEW."providerId"
      AND b."id" != NEW."id"
      AND b."canceledAt" IS NULL
      AND (
        julianday(b."startUtc") - (COALESCE(sb."bufferBeforeMinutes", 0) / 1440.0)
          < julianday(NEW."endUtc") + (COALESCE(sn."bufferAfterMinutes", 0) / 1440.0)
      )
      AND (
        julianday(b."endUtc") + (COALESCE(sb."bufferAfterMinutes", 0) / 1440.0)
          > julianday(NEW."startUtc") - (COALESCE(sn."bufferBeforeMinutes", 0) / 1440.0)
      )
      AND (
        b."serviceId" != NEW."serviceId"
        OR COALESCE(b."capacitySlot", -1) = COALESCE(NEW."capacitySlot", -1)
      )
  );
END;
