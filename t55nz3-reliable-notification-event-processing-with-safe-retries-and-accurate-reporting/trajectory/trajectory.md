# Trajectory: Building a Reliable, Retry-Safe Notification Event Processor

## The Problem: Unreliable Events Break Production Metrics

Notification systems (push, email, SMS) live or die by correct delivery and acknowledgement tracking.

Events arrive from many sources:

- Delivery providers (FCM, APNs, Twilio, Amazon SES…)
- Client devices (mobile/web ACKs)
- Internal retry mechanisms
- Multiple backend services

In real life these events are **messy**:

- Duplicates (network retry, at-least-once delivery)
- Out-of-order arrival (DELIVERED before SENT)
- Late retries with corrected data (first event malformed → later fixed)
- Invalid/malformed events
- Events for already-terminal notifications

Naive processing causes production incidents:

- ackCount doubles → wrong success rate
- State downgrades (ACKED → DELIVERED)
- lastSeenAt jumps backward
- Valid retries get permanently blocked
- Dashboards lie → alerts fire → SRE + data team unhappy

Goal: **correct final state + accurate activity tracking + provable audit trail — even when the input stream is garbage**.

## The Solution: Idempotent Forward-Only State Machine + Unconditional Activity Update

Core design principles we followed:

1. eventId = global idempotency key  
   Once successfully applied → never apply again (prevents double side-effects)

2. State transitions strictly forward-only  
   NONE → SENT → DELIVERED → ACKED  
   ACKED is terminal — nothing escapes it

3. lastSeenAt updated for **every** valid notificationId  
   Even duplicates, rejects, invalid transitions → max timestamp wins

4. Rejects do **not** remember eventId  
   → later retry with same eventId (but corrected type/data) can still succeed

5. Every input event is audited  
   applied / duplicate / rejected (with specific reason)  
   totalInputEvents = applied + duplicates + sum(rejected)

## Implementation Choices We Made

- Global `Set<string>` of applied eventIds (not per-notification)  
  → simplest & safest when eventIds are unique per emission attempt  
  → most real systems (Twilio, SendGrid, Braze, Firebase) generate new eventId on retry

- No content hashing / version field  
  → keeps code simple; relies on eventId uniqueness

- Always update lastSeenAt first (before any validation)  
  → matches "activity tracking must be correct even if event is rejected"

- No sorting by timestamp  
  → must respect input batch order (explicit requirement)

- Rejected events **never** mark eventId as processed  
  → allows recovery from earlier bad data

## Why We Avoided Certain Approaches

- Did **not** allow same-state transitions (SENT → SENT)  
  → avoids silent no-ops that confuse metrics

- Did **not** use per-notification eventId sets  
  → overkill unless same eventId is legitimately reused across notifications

- Did **not** implement full event sourcing  
  → too heavy for simple state tracking

- Did **not** block forever on first reject  
  → violates "retry with corrected data must apply"

## Recommended Resources (Videos That Explain the Core Ideas)

These videos cover the exact concepts we leaned on: idempotency, duplicate protection, at-least-once delivery problems, preventing double side-effects.

1. **Idempotency: Protect Yourself Against Multiple Event Processing Mistakes**  
   → https://www.youtube.com/watch?v=ufHA8cC7kgc  
   Explains why duplicates are inevitable and how unique event IDs prevent double-processing (very close to our appliedEventIds Set).

2. **Fix Duplicate Messages with the Idempotent Consumer Pattern**  
   → https://www.youtube.com/watch?v=GsZ_ZtlRCBg  
   Practical look at making consumers safe against duplicates — directly applies to avoiding double ackCount increments.

3. **Handle Duplicate Messages With Idempotent Consumers** (Milan Jovanović)  
   → https://www.youtube.com/watch?v=mGeEtokcjVQ  
   Deep dive into patterns for idempotent event handlers — great for understanding why we reject duplicates but allow valid retries.

4. **Handling Duplicate Messages (Idempotent Consumers)**  
   → https://www.youtube.com/watch?v=xeBY8fCWfvU  
   Short & clear explanation of at-least-once semantics and why idempotency is required.

5. **Idempotency and ordering in event-driven systems**  
   → https://www.youtube.com/watch?v=ZOZ8LuVS8VY  
   Covers duplicates + out-of-order events together — relates to our forward-only transitions and max timestamp for lastSeenAt.

Bonus (broader notification context):  
**Design a Scalable Notification Service**  
→ https://www.youtube.com/watch?v=0sU3foF2BqE  
Shows retries, backoff, and failure patterns in notification pipelines.

## Testing Mindset

We made sure the processor survives these scenarios:

- Normal happy path
- Duplicate successful event → no double ack
- Out-of-order events → correct final state
- ACKED → any later event → rejected (terminal)
- Earlier reject → later valid retry with same eventId → accepted
- Empty/missing notificationId → no state created
- Invalid type → clear rejection reason
- Mixed mess in one batch → report still adds up perfectly

## Result

After even the worst batch:

- NotificationState is correct (no downgrades, no double acks)
- lastSeenAt reflects latest observed activity
- Report proves reconciliation: every event is accounted for
- Metrics become trustworthy again

This turns "metrics are broken again" into "we can trust the numbers".
