/**
 * Legacy rolling metrics store (works, but slow + memory heavy).
 * DO NOT change the public API shape.
 *
 * Public API:
 *   const store = createRollingMetricsStore({ windowMs, entityTtlMs })
 *   store.ingest(event)
 *   store.getMetrics(entityId) -> { total, byType, lastSeenAt } | null
 *   store.listEntities() -> array of entityIds
 *   store.evict(entityId) -> boolean
 *   store.gc(nowMs) -> number (how many evicted)
 *
 * Event:
 *   {
 *     entityId: string,
 *     type: string,        // e.g. "action", "update", "warning"
 *     ts: number           // epoch millis
 *   }
 */

function createRollingMetricsStore(opts) {
  opts = opts || {};
  var windowMs = typeof opts.windowMs === "number" ? opts.windowMs : 5 * 60 * 1000;
  var entityTtlMs = typeof opts.entityTtlMs === "number" ? opts.entityTtlMs : 30 * 60 * 1000;

  // Naive: keep all events forever per entity
  var eventsByEntity = {}; // entityId -> array of events

  function ingest(event) {
    if (!event || typeof event.entityId !== "string") return;
    if (typeof event.type !== "string") return;
    if (typeof event.ts !== "number") return;

    var arr = eventsByEntity[event.entityId];
    if (!arr) {
      arr = [];
      eventsByEntity[event.entityId] = arr;
    }
    arr.push({ entityId: event.entityId, type: event.type, ts: event.ts });
  }

  // Naive: recompute from scratch, filters whole array each call
  function getMetrics(entityId) {
    var arr = eventsByEntity[entityId];
    if (!arr) return null;

    var now = Date.now();
    var cutoff = now - windowMs;

    var total = 0;
    var byType = {};
    var lastSeenAt = 0;

    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (e.ts > lastSeenAt) lastSeenAt = e.ts;

      // include only in rolling window
      if (e.ts >= cutoff) {
        total += 1;
        byType[e.type] = (byType[e.type] || 0) + 1;
      }
    }

    // NOTE: No TTL eviction here; entity can live forever.
    return { total: total, byType: byType, lastSeenAt: lastSeenAt };
  }

  function listEntities() {
    return Object.keys(eventsByEntity);
  }

  function evict(entityId) {
    if (eventsByEntity[entityId]) {
      delete eventsByEntity[entityId];
      return true;
    }
    return false;
  }

  // Naive: TTL scan over all entities + recompute lastSeenAt by scanning all events
  function gc(nowMs) {
    var now = typeof nowMs === "number" ? nowMs : Date.now();
    var ids = Object.keys(eventsByEntity);
    var evicted = 0;

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var arr = eventsByEntity[id];
      if (!arr || arr.length === 0) {
        delete eventsByEntity[id];
        evicted += 1;
        continue;
      }

      // expensive lastSeenAt recompute
      var lastSeenAt = 0;
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].ts > lastSeenAt) lastSeenAt = arr[j].ts;
      }

      if (now - lastSeenAt > entityTtlMs) {
        delete eventsByEntity[id];
        evicted += 1;
      }
    }

    return evicted;
  }

  return {
    ingest: ingest,
    getMetrics: getMetrics,
    listEntities: listEntities,
    evict: evict,
    gc: gc
  };
}

module.exports = { createRollingMetricsStore };
