# Trajectory: Building a Full-Stack Countdown Timer

## The problem: This project started as more than just “build a countdown timer.”

-Most tutorial timers are very limited. They usually:
-Only support one countdown
-they Can’t be shared
-Have no personality or emotional value
But in real life, countdowns are related to meaningful moments — birthdays, vacations, launches, deadlines. I wanted to turn a temporary, private utility into something persistent, personal and shareable.
The real challenge wasn’t just counting time, it was basically designing an experience around emotional milestones.
---

## Conceptual Shift

### From a Private Tool to a Shareable Experience
Instead of treating a countdown as something that lives only in one browser tab, I reframed it as a public artifact that anyone could access.
Key ideas:
1. Each countdown has its own unique, shareable URL
2. No login required to view a countdown
3. Users can personalize the look and feel (themes, colors, backgrounds)
4. Accounts are optional, only needed if users want to manage multiple countdowns or sync across devices

---

## The solution

### Architecture used
1. **Frontend**: React 18 with TypeScript
2. **Backend**: Node.js with Hono framework
3. **Database**: PostgreSQL with Prisma ORM
4. **Styling**: Tailwind CSS with CSS variables
5. **Animations**: Framer Motion
6. **Shareable Links**: Nanoid-generated slugs
7. **Authentication**: JWT-based optional authentication

---

## Implementation Detail

### Backend Structure
- Hono provides a fast, minimal, TypeScript-first API layer
- Prisma ensures type-safe database access and clean schema evolution
- JWT authentication allows stateless, optional user accounts
- Slug-based routing enables public countdown pages without exposing internal IDs

### Database Schema
- Users: Only required for advanced features like dashboards
- Countdowns: Store target date, timezone, theme, and customization
- Slugs: Unique identifiers for public access
- Timestamps: Track creation and updates for consistency

---

## Frontend Structure
- Framework: React 18 with TypeScript
- Routing: React Router v6
- State Management: React Context for authentication
- Forms: React Hook Form with Zod validation

### Core Components
1. CountdownForm
2. CountdownDisplay
3. CountdownGrid (user dashboard)
4. Authentication pages
 i implemented each component to be reusable.
---

## Key challenges and how i solved them
Real-Time countdown updates
I used setInterval inside useEffect with proper cleanup using clearInterval to ensure smooth updates without memory leaks.

Timezone Consistency
All timestamps are stored in UTC and converted to the user’s local or selected timezone at display time. This avoids edge cases across regions.

Human-friendly countdown states
Instead of just showing numbers, I implemented a unified time utility that returns three states:
upcoming
happening now
past
This allows the UI to naturally transition from countdown to count-up.

Optional External APIs
Background images from Unsplash are optional. If the API isn’t available, the UI gracefully falls back to solid colors or placeholders without breaking the experience.
---

## UX decisions that matters

Users are automatically logged in after registration
Authentication is never required to view a countdown
Form validation happens before API calls using Zod + React Hook Form
Errors are caught early and feedback is immediate

The goal was just to keep friction low and the experience intuitive.

---

## Testing Strategy

Unit Testing

-Backend endpoints are tested with Jest and Supertest
-Frontend components and form logic tested with React Testing Library

Integration Testing

-Full flow from countdown creation to public access via slug
-Ensured frontend and backend stayed in sync

---

## Resources I Used
1. **freeCodeCamp Countdown Tutorial** – watched a youtube video-how to build a countdown timer with react
https://www.freecodecamp.org/news/build-a-countdown-timer-with-react-step-by-step/
2. **Hono Documentation** – used it for backend framework reference
: https://hono.dev/
3. **Prisma Documentation** – to see the data modeling and ORM usage
https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference
4. **Framer Motion Documentation** – animation patterns
 https://www.framer.com/motion/examples/

---

## Final Deliverable

1. Multi-countdown support with visual customization
2. Public, shareable countdown URLs without authentication
3. Optional user accounts with personal dashboards
4. Animated real-time countdown display
5. Clear state handling: upcoming, happening, and past
6. Fully implemented modern tech stack
