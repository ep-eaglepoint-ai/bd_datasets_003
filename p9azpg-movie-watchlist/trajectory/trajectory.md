# Trajectory: Building a personal movie watchlist application

## The General Idea

Create a personal movie watchlist app where users can search for films and view rich details (synopsis, cast, ratings, trailers). Allow users to save movies to custom lists, rate and review titles, and track viewing history. Provide personalized recommendations based on a user’s history and ratings. Keep accounts simple so lists and ratings are saved per user, and design an intuitive, quick search‑to‑add flow with clear, film‑focused pages for enthusiasts.

## Implementation Steps

1.  **Use Svelte and SvelteKit:** Used a light weight and reactive framework.
2.  **Encrypted Logging Mechanism** Used bcyrpt to hash and store users password
3.  **Sqlite Database** Used light weight fast relational database for storing user and movie lists.

## Why I did it this way (Refinement)

Initially I was going to use Next.Js but Svelte is lighter and good for fast production build.

---

### 📚 Recommended Resources

**1. Read: Horizontal vs. Vertical Scaling**
Understanding the basics of Svelte.

- [Documentation: What is Svelte and SvelteKit](https://svelte.dev/tutorial/kit/introducing-sveltekit)

**2. SvelteKit with SQLite and Drizzle - Full Stack SvelteKit**
Setting up database connection with drizzle ORM SQLite and Svelte.

- [Article: SvelteKit with SQLite and Drizzle](https://fullstacksveltekit.com/blog/sveltekit-sqlite-drizzle)
