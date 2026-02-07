# Trajectory:

## The Goal

The API was slow because identical Prisma queries executed on every request, even when the data had not changed.  
The goal was to implement a Redis caching layer so cached responses return instantly, database load is reduced, and the API remains stable even if Redis fails.

I used Redis caching best practices as reference:  
https://redis.io/docs/latest/develop/use/patterns/

## Step 1: Adding a Safe Redis Client

I implemented a safe Redis wrapper (`safeRedis`) so Redis failures never crash the API.

All cache operations go through this wrapper.  
If Redis fails, the system falls back to Prisma queries and still returns a valid response.

This ensures Redis is an optimization layer, not a required dependency.

## Step 2: Designing Correct Cache Keys

I implemented structured cache keys that include:

- resource name
- resource id
- query parameters
- user id when required

Examples:

- `articles_list:page=1:limit=20`
- `article:a-1`
- `categories_list`
- `user:u-1`

This ensures different queries and users never receive incorrect cached data.
Reference:  
https://redis.io/docs/latest/develop/use/keyspace/

## Step 3: Implementing Cache Middleware

I created a caching middleware that:

1. Generates cache key
2. Checks Redis first
3. Returns cached response immediately if found
4. Otherwise fetches from Prisma and stores in Redis

This ensures cached requests avoid database queries completely.

## Step 4: Implementing Stale-While-Revalidate

I implemented stale-while-revalidate so cached data returns instantly while Redis refreshes in the background.

This keeps responses fast while maintaining freshness.

## Step 5: Preventing Cache Stampede

I implemented request coalescing so concurrent requests for the same uncached key share one database query.

This prevents database overload when cache expires.

Reference:  
https://en.wikipedia.org/wiki/Thundering_herd_problem

## Step 6: Implementing Targeted Cache Invalidation

I implemented invalidation using Redis SCAN so only affected cache entries are removed.

Examples:

- POST article → invalidate `articles_list:*`
- PUT/DELETE article → invalidate `article:<id>:*` and `articles_list:*`
- Category changes invalidate only related category keys

This keeps cache accurate without clearing everything.

## Step 7: Adding Cache Metrics Endpoint

I implemented cache metrics tracking:

- hits
- misses
- sets
- errors
- hit rate

Exposed via:

GET `/api/admin/cache-metrics`

This allows monitoring cache effectiveness.
