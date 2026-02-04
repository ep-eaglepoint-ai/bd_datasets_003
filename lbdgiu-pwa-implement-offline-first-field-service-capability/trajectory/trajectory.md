# Trajectory: Building a Resilient Field Service PWA

## The Problem: Offline First Field Service Capability

Technicians often work in basements, rural areas, or steel-reinforced buildings where internet signals are weak or non-existent. A standard web app fails here because:

1. **Dependency on Connectivity:** If the signal drops while hitting "Submit," the data is lost.
2. **UI Freezing:** Without a connection, the browser shows a "No Internet" dinosaur, rendering the tool useless.
3. **Conflict Management:** If two technicians update the same report, the last one to click "Save" usually overwrites the other without warning.

## The Solution: Offline-First Architecture

We transform the app from a "browser-dependent site" into a "locally-powered application" using three pillars:

1. **Service Worker (The Gatekeeper):** Acts as a local proxy. It intercepts network requests and serves assets from a local cache (Cache-First), ensuring the app loads instantly even in a tunnel.
2. **IndexedDB (The Vault):** A robust database inside the browser. We save reports here immediately. The UI talks to this "Vault" first, so "Saving" is always instantaneous and never fails.
3. **Sync Manager (The Courier):** A background process that watches for the `online` event. When a signal is detected, it handles the complex logic of sending data to the server using **Exponential Backoff** (waiting longer between retries) so it doesn't crash on a flickering 3G signal.

## Implementation Steps

1. **Persistent Storage Layer:** We initialized IndexedDB to handle at least 50 reports. We added a **cleanup routine** that purges synced records older than 7 days to keep the technician's device storage lean.
2. **Robust API Hook:** We built the `uploadReport` function with recursion. If it fails, it waits (1s, 2s, 4s...), giving the technician time to move to a better signal area.
3. **Conflict Detection:** Before the Courier overwrites data on the server, it checks a `last_modified` timestamp. If the server's version is newer, it throws a `412 Conflict` to prevent data loss.
4. **UI Chunking:** To keep the app snappy (under 100ms response time), we process large syncs in small batches (chunks), yielding control back to the browser between batches so the screen doesn't "freeze."

## Why I did it this way (Refinement)

Initially, I considered using `localStorage` for simplicity. I pivoted to **IndexedDB**. `localStorage` is synchronous and limited to 5MB, which would freeze the UI during large saves and fail if a technician attached high-res photos to a report. IndexedDB is asynchronous and handles much larger datasets safely.

### 📚 Recommended Resources

**1. Watch:  Intro To Service Workers & Caching**
A visual breakdown of how the Service Worker sits between your app and the internet.

* [YouTube: Service Workers and the Cache API](https://www.youtube.com/watch?v=ksXwaWHCW6k)

**2. Watch: IndexedDB Crash Course with Javascript**
Why IndexedDB is the standard for modern offline web applications.

* [YouTube: IndexedDB Crash Course](https://www.youtube.com/watch?v=vb7fkBeblcw)