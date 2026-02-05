# Trajectory - news-reader

## 1. Problem Statement

Based on the prompt and problem statement, I understood that a media company needed a **modern, fast, and readable digital news experience** that replaces a slow, cluttered WordPress site. I framed the core problem as: *“How do I present a collection of articles in a way that feels like a contemporary online magazine, is pleasant to read on all devices, and makes it easy to move between the article list and full article views?”* I also noted that user research emphasized **no sidebars/ads, strong typography, and category-based navigation**, so I treated those as first-class design drivers rather than optional details.

## 2. Requirements I Extracted

Based on the requirements, I identified these concrete goals:

- **Stack and project structure**
  - I must use **Next.js with the App Router**, **TypeScript**, and **Tailwind CSS**, initialized via `npx create-next-app` with the correct flags.
  - All UI code must be **typed `.tsx` components**.

- **Article data model**
  - I must have a dedicated data module (named like `lib/articles.ts`) that:
    - Defines a **TypeScript interface** with `id`, `title`, `excerpt`, `content`, `category`, `author`, `publishedAt`, and `imageUrl`.
    - Exports an **array of at least 12 articles**, with **≥4 categories** and **2–3+ articles per category**.

- **Home page layout**
  - I must build a **newspaper-style grid**:
    - 1–2 **hero articles** at the top with larger imagery and more prominence.
    - A **grid of smaller article preview cards** below.
  - Each card must show **image, title, excerpt, category badge, date**.

- **Navigation and interaction**
  - A **category navigation bar** near the top must list all categories plus **All**.
  - Clicking a category filters the articles; the **selected category is visually highlighted**.
  - Clicking any article card must navigate to an **article detail page at `/article/[id]`**.
  - The detail page must show **title, author, date, category badge, hero image, full content**, and a **Back-to-list control** that returns to the main listing.

- **Design and responsiveness**
  - The design must be **typography-focused**, similar to sites like The Verge / Medium:
    - Comfortable body text, good line-height, spacing, and contrast.
    - I should use **`@tailwindcss/typography`** for the article body.
  - The layout must be **fully responsive**:
    - **Mobile**: single-column stacked cards.
    - **Tablets/desktops**: multi-column (2–3 columns) grid for articles, and hero section that adapts gracefully.
  - Article cards should have **subtle hover effects** (shadow/zoom) for polish.

- **State management**
  - Category selection can be **ephemeral**; I must use **`useState`** on the client and **don’t persist** across navigation or reloads.

## 3. Constraints I Considered

From the prompt and technical context, I treated these as constraints:

- **No backend**: all article content must come from a **local TypeScript module**, no API calls.
- **App Router only**: I must use the **`app/` directory** and idiomatic App Router primitives, not the old `pages/` router.
- **Type safety**: the implementation must be **strictly typed** and idiomatic TypeScript in components and data.
- **Clean UI and performance**:
  - No sidebars or ad-like clutter.
  - Layout must be lightweight and fast on mobile.
- **Simple state**: category filter state must rely only on **React state hooks**, without URL params, localStorage, or global state libraries.

These constraints pushed me toward a **client-side filtered list** over a static data source rendered through App Router pages, with careful attention to component boundaries and responsive Tailwind classes.

## 4. Research I Did (Docs, Guides, and Patterns)

To ground the implementation in real-world patterns, I looked up:

- **Next.js App Router and layout patterns**
  - Next.js App Router documentation, especially for `app` directory structure, routing, and dynamic segments:  
    - [Next.js App Router docs](https://nextjs.org/docs/app)
    - [Next.js Routing and Dynamic Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
  - Examples of **landing page + detail page** structures in App Router.

- **TypeScript + Next.js best practices**
  - How to type page components, props, and shared data:  
    - [Next.js with TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript)

- **Tailwind CSS + typography and layout**
  - Tailwind core docs for grids, spacing, typography, and responsive modifiers:  
    - [Tailwind CSS documentation](https://tailwindcss.com/docs)
  - Typographic styling with the prose plugin:  
    - [`@tailwindcss/typography` plugin](https://tailwindcss.com/docs/typography-plugin)

- **Modern news layout inspiration**
  - I examined layouts from modern publications (for structure and feel, not copying):
    - [The Verge](https://www.theverge.com/)
    - [Medium](https://medium.com/)

From these, I confirmed:

- Using **App Router pages** (`app/page.tsx`, `app/article/[id]/page.tsx`) is the idiomatic way to structure the listing/detail pair.
- A **shared `lib/articles.ts` data module** is a clean pattern for static content.
- Combining **grid utilities** (`grid`, `md:grid-cols-2`, `lg:grid-cols-3`) and **`prose`** for article bodies is widely recommended for content-heavy layouts.

## 5. Choosing the Overall Approach (and Why)

### 5.1 Data modeling and sourcing

I decided to:

- **Define a single `Article` interface** with the required fields and keep it in a dedicated data module.
- **Export a constant `articles` array** with at least 12 typed objects and 4+ categories, each with 2–3+ items.

I chose this because:

- It centralizes article metadata in **one place**, making both the list and detail pages consistent.
- TypeScript enforces that every article has all required fields, so I don’t risk missing properties in the UI.
- A simple in-memory array keeps the implementation deterministic and avoids unnecessary complexity.

### 5.2 App structure and routing

I implemented:

- A **home page** at `app/page.tsx` to display the hero section and article grid.
- An **article detail page** at `app/article/[id]/page.tsx` using a dynamic segment.

I chose this structure because:

- It is the **canonical App Router layout** for list/detail flows.
- Dynamic routes make it trivial to map URL IDs directly to items in the `articles` array.
- Keeping the listing and detail logic in **separate, focused page components** improves readability and separation of concerns.

### 5.3 State and filtering

On the home page, I:

- Used **`useState<string>`** to track the currently selected category (default `"All"`).
- Used **`useMemo`** to derive a **filtered list of articles** whenever the selected category changes.

I chose this because:

- It satisfies the requirement to use **React state** without persistence.
- `useMemo` avoids unnecessary recomputation of filtered lists on every render while keeping the logic simple.
- The filter logic is **pure and deterministic**: given a selected category and the static `articles` list, the UI is always consistent.

### 5.4 Layout and visual design

For the layout, I:

- Implemented the hero section as a **top-of-page grid** that selects the first 1–2 articles and renders them with **larger images and typography**.
- Implemented the rest of the listing as a **responsive card grid** using `grid`, `gap-*`, `md:grid-cols-2`, and `lg:grid-cols-3`.
- Wrapped article content on the detail page in a **`prose`-styled container** for comfortable reading.

I chose these patterns because:

- They directly match the “featured hero + grid of previews” requirement.
- Tailwind’s responsive classes make it easy to express:
  - **Single column on mobile** (default stack).
  - **Two columns on medium screens** and **three on large** screens.
- The `prose` class from `@tailwindcss/typography` gives an **accessible, magazine-like reading experience** with very little custom CSS.

### 5.5 Navigation and back link

I:

- Wrapped each article card in a **link to `/article/[id]`**.
- Added a clear **“Back to Articles”** link on the detail page that routes back to the main listing.

I did this because:

- Using semantic anchor links ensures **keyboard accessibility** and predictable navigation.
+- A persistent back link on the detail page ensures users are not forced to rely on browser controls, satisfying the explicit back-navigation requirement.

## 6. Solution Implementation (Step by Step)

### 6.1 Project initialization and configuration

1. I **initialized a Next.js app** with the App Router, TypeScript, and Tailwind enabled via `create-next-app`.
2. I **configured Tailwind**:
   - Enabled the `app` directory in the content paths.
   - Registered the **`@tailwindcss/typography` plugin**.
3. I verified that the app could run with the default starter to ensure a clean baseline.

### 6.2 Article data module

1. I created a **TypeScript interface** for articles with the required fields: `id`, `title`, `excerpt`, `content`, `category`, `author`, `publishedAt`, and `imageUrl`.
2. I populated a **static `articles` array**:
   - Ensured there were **at least 12 entries**.
   - Chose categories such as **World, Technology, Sports, Entertainment**.
   - Ensured each category had **2–3+ articles**.
   - Wrote content and excerpts that read like real editorial blurbs, using realistic headlines and short summaries.
3. I used **consistent `imageUrl`s** from free stock-style URLs that felt on theme for each category (e.g., cityscapes for World, devices for Technology, stadiums for Sports).

### 6.3 Home page: structure and hero layout

1. I built the home page component as a **client component** since it uses `useState`.
2. At the top of the page, I added:
   - A **header** with the site title “Digital News Reader”.
   - The **category navigation bar** just below the title.
3. I split the article list into:
   - A **hero subset** (first 1–2 articles), rendered in a two-column grid on medium+ screens and stacked on mobile.
   - An **“All Articles” section** below, with a responsive `grid` for smaller cards.
4. Each hero card:
   - Uses a **large image container** with `relative` sizing and an image set to `object-cover` and `fill` for immersive visuals.
   - Shows a **category badge**, **headline**, **excerpt**, and **author/date row**.
5. Each grid card:
   - Uses a **compact variant** of the hero card layout.
   - Maintains the required fields: image, title, excerpt, category badge, date.

### 6.4 Category navigation and filtering logic

1. I defined the list of categories by **deriving unique category names** from the articles and prepending `"All"`.
2. I rendered them as **buttons** in a horizontal, wrapping bar:
   - Each button uses Tailwind classes for **padding, rounded corners, and transitions**.
   - The **currently selected** button receives a **strong background and text color** (e.g., dark background with white text).
3. I wired up `onClick` handlers that:
   - Update `selectedCategory` via `setSelectedCategory(category)`.
   - Cause the memoized `filteredArticles` list to recalculate.
4. I used `filteredArticles` both for computing:
   - Which articles appear in the **hero section** (first 1–2 of the filtered set).
   - Which appear in the **grid section** (the remaining items).
5. I ensured the **default state** is `"All"` so users see the full breadth of content on first load.

### 6.5 Article detail page

1. I implemented a dynamic route component that receives `params.id`.
2. Inside the page:
   - I look up the article by `id` from the shared `articles` list.
   - If no article is found, I call the appropriate App Router not-found behavior to render a 404-style result.
3. For a valid article:
   - I render the **title** as a top-level heading.
   - I display the **category badge**, **author**, and **formatted publication date** in a metadata row.
   - I render a **large hero image** similar to the hero cards on the listing.
   - I wrap the **main body text** inside a `prose` container to get good typography out of the box.
4. I placed a clear **“Back to Articles”** link at the top of the page:
   - It navigates back to the home route.
   - It is styled as a subtle, but easily discoverable, control.

### 6.6 Styling choices and micro-interactions

1. For **typography**, I:
   - Chose **large, bold headings** for titles.
   - Used neutral, high-contrast colors (`text-gray-900` on white) for main text.
   - Used lighter `text-gray-600`/`text-gray-500` for metadata.
   - Relied on **`prose`** for article bodies, with comfortable line length and spacing.
2. For **hover effects**, I:
   - Applied `hover:shadow-xl` and `transition-shadow duration-300` on article card containers.
   - Applied `group-hover:scale-105` and `transition-transform` to images for a gentle zoom effect.
3. For **responsive behavior**, I:
   - Used Tailwind’s responsive prefixes (`sm:`, `md:`, `lg:`) to:
     - Adjust grid columns (`md:grid-cols-2`, `lg:grid-cols-3`).
     - Increase image and text sizes at larger breakpoints.
   - Ensured padding and max widths were tuned (e.g., `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`) so content stays centered and readable on large screens.

## 7. How the Solution Handles Requirements, Constraints, and Edge Cases

### 7.1 Fulfilling the explicit requirements

- **Project setup**: The app is built with **Next.js App Router**, **TypeScript**, and **Tailwind**, with all components written as `.tsx`.
- **Data file and model**:
  - There is a dedicated article data module exporting a **typed `articles` array**.
  - Each object includes all required fields; several categories are represented with **12+ total articles** and **≥2–3 per category**.
- **Home page and layout**:
  - The home page renders **1–2 featured hero articles** and a **grid of smaller preview cards** below.
  - Every card shows **image, title, excerpt, category badge, date**.
- **Category navigation**:
  - The navigation bar lists **All + every category**.
  - Clicking a category filters the displayed articles via **React state**.
  - The selected category button has **distinct visual styling**.
- **Article detail page**:
  - The dynamic route **`/article/[id]`** displays all required article fields.
  - There is a clear **Back link** that returns to the main listing route.
- **Typography and design**:
  - **`@tailwindcss/typography`** is used to style the article body.
  - Text uses **clear hierarchy, spacing, and contrast**, aligning with modern digital magazine style.
- **Responsiveness**:
  - Grid and hero layouts use Tailwind responsive classes to collapse to **one column on mobile** and expand to **multi-column layouts** on tablet/desktop.
- **Hover effects**:
  - Article cards and hero images have **subtle hover shadows and zoom**, providing micro-interactions without overwhelming the reader.

### 7.2 Respecting constraints and handling edge cases

- **No backend / static data**:
  - All content comes from the local article module; no APIs or asynchronous fetching are required. This makes the UI **fast, deterministic, and easy to host.**
- **App Router idioms**:
  - Using `app/page.tsx` and `app/article/[id]/page.tsx` follows **current Next.js recommendations**, avoiding deprecated patterns.
- **Missing article IDs**:
  - If a user navigates to an unknown article ID, the detail page **handles the missing case** gracefully by using the App Router’s not-found mechanism.
- **Filter edge cases**:
  - When a category is chosen, the filter logic:
    - Always returns **0 or more** articles based on the static list.
    - Never crashes if, hypothetically, a category had no articles; the UI simply shows an empty grid.
  - Switching back to **All** always restores the full list.
- **Accessibility considerations**:
  - Proper semantic elements (`main`, `header`, headings, `article`, `nav`, and `a` for cards) make the layout more accessible to screen readers.
  - Category buttons are real `<button>` elements, not spans, so they are naturally focusable and clickable via keyboard.

By iterating through the requirements in order—first clarifying the domain and constraints, then designing the data model and routing, and finally refining layout, typography, and interactions—I arrived at a **deterministic, idiomatic Next.js implementation** that directly addresses the prompt and the editorial team’s goals for a clean, modern digital news reading experience.

