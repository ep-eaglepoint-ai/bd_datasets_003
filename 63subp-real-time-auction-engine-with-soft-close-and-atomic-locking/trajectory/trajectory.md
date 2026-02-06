# Trajectory

# Trajectory

# Trajectory: Real-Time Auction Engine with Soft Close & Atomic Locking

## Overview

This document describes the design and implementation of a real-time auction engine that prevents race conditions, reduces auction sniping, and keeps all clients synchronized using atomic database operations and real-time events.

---

## The Problem

### 1. Race Conditions

In a naive auction implementation, bidding works as a simple read-then-write operation:

1. Read current highest bid
2. Check if new bid is higher
3. Save new bid

If two users bid at nearly the same time, the server may:

* Accept two bids incorrectly
* Allow a lower bid to overwrite a higher bid
* Become inconsistent about who actually won

### 2. Auction Sniping

"Snipers" place bids at the very last second, leaving no time for others to respond. In real-world auctions, auctioneers extend time with calls like:

> "Going once, going twice..."

Without this behavior, users feel the system is unfair and frustrating.

---

## The Solution

We solve these issues using three core strategies:

1. **Atomic Database Locking**
2. **Soft Close (Dynamic Auction Extension)**
3. **Real-Time Synchronization**

---

## Atomic Locking (Database Referee)

Instead of separate check-and-save steps, we perform a single atomic operation at the database level:

> "Only update this bid if the new amount is strictly higher than the current highest bid."

### Benefits

* Prevents two users from winning simultaneously
* Guarantees correct ordering of bids
* Eliminates race condition overwrites

### Implementation

* Use SQLite transactions
* Database processes bids one-by-one
* Any bid that is not strictly higher is automatically rejected

This makes the database the final authority (referee) for bid correctness.

---

## Soft Close (Dynamic Timer Extension)

We implement a digital auctioneer behavior.

### The 30-Second Rule

If a bid is placed within the final 30 seconds of an auction:

* Automatically extend the auction by 60 seconds
* Persist the new `end_time` in the database

### Why This Matters

* Prevents last-second sniping
* Gives all bidders a fair chance to respond
* Increases auction engagement and revenue

### Server-Authoritative Time

Initially, the timer logic was kept in the browser.

#### Correction

This caused issues when users refreshed the page.

Now:

* Timer logic lives on the server
* `end_time` is stored in the database
* All users see the same authoritative clock
* Timer survives server restarts and page refreshes

---

## Real-Time Sync with Socket.io

To keep all users synchronized, we broadcast updates in real time.

### Events Sent

When a valid bid is accepted, the server emits:

* New highest bid
* Updated auction `end_time`

### Dual-Key Emit

To support both frontend UI and automated test scripts, we emit both keys:

* `end_time`
* `endTime`

This ensures compatibility across systems.

---

## Data Flow Summary

1. User submits bid
2. Server executes atomic transaction
3. Database accepts or rejects bid
4. Server checks remaining time
5. If within 30 seconds, extend auction
6. Server saves updated `end_time`
7. Server emits real-time update via Socket.io
8. All clients update UI instantly

---

## Testing Strategy

We built an integrated evaluation script that simulates real user behavior:

### Test Capabilities

* Starts the server
* Clears the database
* Places multiple concurrent bids
* Verifies atomic rejection of invalid bids
* Places late-stage bids
* Confirms that Soft Close extends auction time
* Compares timestamps before and after extension

This ensures correctness under real-world race conditions.

---

## Why This Design

| Concern             | Solution                   |
| ------------------- | -------------------------- |
| Race conditions     | Atomic DB transactions     |
| Last-second sniping | Soft Close timer extension |
| Page refresh issues | Server-authoritative time  |
| Out-of-sync clients | Socket.io real-time events |

This architecture ensures fairness, consistency, and scalability.

---

## Recommended Resources

### 1. Database Transactions & Race Conditions

Understanding why atomic operations are critical in concurrent systems.

* YouTube: *Database Transactions Explained*

### 2. Socket.io in 100 Seconds

Quick overview of real-time event-driven systems.

* YouTube: *Socket.io Explained*

### 3. Soft Close / Bid Extension Logic

Business reasoning behind auction timer extensions.

* Article: *The Importance of Bid Extension / Soft Close*

---

## Summary

This auction engine design:

* Prevents race conditions
* Eliminates unfair sniping
* Keeps all clients synchronized
* Uses the database as the single source of truth

Result: A fair, secure, and production-ready real-time auction system.
