# Trajectory

## Requirement 1 – 5-Color Palette Generator

### The Problem

Designers need a tool to quickly generate harmonious color palettes. It should allow them to lock colors they like while regenerating the rest, so they can iterate efficiently without losing selected colors.

### The Solution

Build an interactive 5-color palette generator where each color can be locked. Clicking “Generate New” updates only the unlocked colors, keeping locked ones intact.

### Implementation Steps

1. **Color Logic (src/lib/colorGenerator.ts)**
   - `randomHexColor()` → generates a random hex color.
   - `generatePalette(current, locked)` → regenerates only unlocked colors.

2. **UI Component (src/components/PaletteGenerator.tsx)**
   - Display 5 color blocks with **hex codes**.
   - Add **lock/unlock buttons** for each color.
   - Add **Generate New button** to refresh colors respecting locks.
   - Use **Tailwind CSS** for styling.

3. **Integration**
   - Imported component in `src/app/page.tsx` for display.

### Why I Did It This Way

- Separating **logic from UI** makes it reusable, testable, and extensible for future color theory features.
- Using **locked state** ensures user-selected colors are preserved.
- Tailwind + TypeScript ensures a responsive, type-safe, and maintainable UI.

## Requirement 2 – Image Palette Extractor

### The Problem

Designers often want to extract colors from existing images to build palettes. The tool must support multiple extraction modes (Vibrant, Muted, Dominant) and display the results clearly alongside the source image.

### The Solution

Implement an image upload system that extracts color palettes using **node-vibrant**. Users can preview the image, choose an extraction mode, and view the resulting colors in a grid.

### Implementation Steps

1. **API Route (src/app/api/extractColors/route.ts)**
   - Accepts **image + extraction mode** via FormData.
   - Uses **node-vibrant/node** to generate a palette.
   - Returns colors as a JSON array.

2. **UI Component (src/components/ImagePaletteExtractor.tsx)**
   - Upload image and preview it.
   - Buttons to switch between **Vibrant, Muted, Dominant**.
   - Display extracted colors in a **clean, readable grid**.
   - Show a **loading state** during extraction.
   - Styled with **Tailwind CSS**.

3. **Integration**
   - Imported component in `src/app/page.tsx` below the palette generator.

### Why I Did It This Way

- Using a **server-side API route** prevents client-side dependency issues and allows Node-only modules like `node-vibrant/node`.
- Separating extraction logic from UI keeps the component **clean and maintainable**.
- Tailwind ensures a **consistent, visually appealing layout**, with mode buttons and color grid easy to read.

## **Requirement 3 Trajectory**

### **The Problem**

Designers and developers need a way to **manually select colors**, check **accessibility contrast**, and get **color harmony suggestions** while building palettes. The app should allow them to pick a base color and see complementary, analogous, triadic, and split-complementary suggestions in real-time.

### **The Solution**

Create a **Color Picker Palette tool**:

- A **color picker input** lets users select a base color.
- Display **real-time suggestions** using color harmony rules:
  - Complementary
  - Analogous
  - Triadic
  - Split-complementary

- Calculate **contrast ratios** between colors for accessibility.
- Allow users to **add manually picked colors to the palette** for further use.

### **Implementation Steps**

1. **Create a new component** `ColorPickerPalette.tsx` in `src/components`.
2. **Add a color picker input** to allow users to select a base color.
3. **Use a color utility module** (`colorUtils.ts`) to calculate:
   - Complementary color
   - Analogous colors
   - Triadic colors
   - Split-complementary colors
   - Contrast ratio between colors

4. **Render suggestions** in a visually appealing grid:
   - Base color in one block
   - Harmony suggestions next to it
   - Show hex codes and contrast ratio for accessibility

5. **Allow users to add colors to their palette**:
   - Clicking a suggested color adds it to a palette array
   - Palette can be used later for export or saving

6. **Style the component** using Tailwind CSS:
   - Clean grid layout
   - Clear text over colored blocks
   - Responsive spacing and hover effects

7. **Test the functionality in the browser**:
   - Pick colors
   - Check suggestions
   - Verify contrast calculations

### **Why I Did It This Way**

- **Modular design**: The color utilities are separate, making the harmony calculations reusable for other parts of the app.
- **User-focused workflow**: Designers can see suggestions instantly and build palettes interactively.
- **Accessibility-aware**: Contrast ratio calculations are built-in, helping users pick accessible color combinations.
- **Extensible**: This component can later be connected to save palettes, organize collections, or export formats.


## Requirement 4 – Save Palettes, Collections, Tags & Descriptions

### The Problem

Designers need to **save palettes to a personal library**, organize them into **named collections** (e.g. “Website Redesign”, “Summer Vibes”), and add **tags and descriptions** so they can find and manage palettes later.

### The Solution

Implement **MongoDB/Mongoose** persistence so logged-in users can save palettes with name, description, tags, and collection. Provide a **Save** flow from the generator, extractor, and picker, plus a **My Library** and **Collections** experience to view and organize saved palettes.

### Implementation Steps

1. **Data Model (src/lib/paletteModel.ts)**
   - Schema: `name`, `colors`, `userId`, `isPublic`, `tags`, `description`, `collectionId`, timestamps.
   - Use Mongoose; export `Palette` model.

2. **API – Save & List (src/app/api/palette/route.ts)**
   - **GET**: Require auth; return palettes for `session.user.id`, sorted by `createdAt`.
   - **POST**: Require auth; accept `name`, `colors`, `description`, `tags`, `collectionId`; set `userId` from session, `isPublic: false` by default.

3. **API – Update Palette (src/app/api/palette/[id]/route.ts)**
   - **PATCH**: Require auth; allow owner to update e.g. `isPublic` (for sharing to gallery).

4. **Collections API (src/app/api/collections/route.ts)**
   - **GET**: Return collections for the current user (for Save modal dropdown and Collections page).

5. **Save Modal (src/components/SavePaletteModal.tsx)**
   - Fields: name, description, tags (comma-separated), collection.
   - On submit: POST to `/api/palette` with palette data.
   - Optional props: `defaultName`, `defaultDescription`, `defaultTags` (e.g. when saving from gallery).

6. **Library Page (src/app/library/page.tsx)**
   - Server component; require auth; fetch user palettes.
   - Grid of palettes with **Share to gallery** / **Unshare** via PATCH so users can choose which palettes are public.

7. **Collections Page (src/app/collections/page.tsx)**
   - List or group user palettes by collection for organization and searchability.

8. **Integration**
   - Add **Save to Library** (and **Sign in to save** when not logged in) next to generator, extractor, and picker; open `SavePaletteModal` with current colors.
   - Nav links: **My Library**, **Collections** (when logged in).

### Why I Did It This Way

- **MongoDB + Mongoose** gives durable storage and a clear schema; `userId` and optional `collectionId` support multi-user and organization.
- **Server-side auth** on GET/POST/PATCH ensures only the owner can read/update their palettes.
- **Save modal** keeps the save flow in one place; default values support “save from gallery” without re-typing.
- **Share to gallery** in Library lets users explicitly choose which palettes are public, matching the requirement that the gallery shows “palettes that users have chosen to share publicly”.


## Requirement 5 – Multiple Export Formats

### The Problem

Designers and developers need to **export palettes in several formats**: CSS custom properties, Tailwind config, SCSS variables, JSON array, and a **downloadable PNG swatch image with hex codes** for use in design tools, code, and documentation.

### The Solution

Implement an **Export** control that supports five formats. For PNG, generate a **swatch image with hex codes displayed** using the browser **Canvas 2D API** (no extra dependency), so the build works everywhere and the output is a single downloadable PNG.

### Implementation Steps

1. **Export Component (src/components/ExportButton.tsx)**
   - Props: `paletteName`, `colors`.
   - **CSS**: Output `:root { --color-1: #hex; ... }`; download as `.css`.
   - **Tailwind**: Output a **Tailwind CSS config object** (`theme.extend.colors.[name]`); download as `.js`.
   - **SCSS**: Output `$color-1: #hex; ...`; download as `.scss`.
   - **JSON**: Output a **JSON array** of hex strings; download as `.json`.
   - **PNG**: Draw on a **canvas** (title + color swatches + hex under each swatch); use **colord** for text contrast; `toDataURL('image/png')` and trigger download.

2. **Placement**
   - Use `ExportButton` next to **Save** on Palette Generator, Image Palette Extractor, and Manual Color Picker so any current palette can be exported.

3. **Integration**
   - Only render export when `colors.length > 0`; no dependency on `html2canvas` so the app builds without extra installs.

### Why I Did It This Way

- **Five formats** match the requirement exactly; CSS/SCSS/JSON/Tailwind are text-based and easy to generate; PNG is generated with Canvas so hex codes are clearly visible on the image.
- **Canvas instead of html2canvas** avoids build/resolution issues and keeps the bundle small while still delivering a “downloadable PNG swatch image with hex codes displayed”.
- **Single ExportButton** reused across tools keeps behavior consistent and avoids duplication.

## Requirement 6 – Public Gallery (Filter, Copy, Save)

### The Problem

Users need a **browsable gallery of palettes that others have chosen to share publicly**, with **filtering by tags and color**, and **one-click copy or save** so they can reuse palettes without re-entering data.

### The Solution

Build a **Gallery** page that fetches only **public** palettes, provides **filter by tag** (dropdown) and **filter by color** (preset chips + color picker), and on each card offers **one-click Copy** (colors to clipboard) and **one-click Save** (for logged-in users: save to library via existing Save modal).

### Implementation Steps

1. **Gallery API (src/app/api/gallery/route.ts)**
   - **GET** (no auth): Return palettes where `isPublic: true`.
   - Query params: `tag` → filter by tag (`tags` array); `color` → filter by hex (normalize and match `colors` array).
   - Return fields: `_id`, `name`, `colors`, `tags`, `description`, `createdAt`.

2. **Share to Gallery (src/app/api/palette/[id]/route.ts)**
   - **PATCH**: Owner can set `isPublic: true | false` so users “choose to share” from My Library.

3. **Library – Share Toggle (src/app/library/page.tsx + LibraryPaletteCard.tsx)**
   - Each palette card has **Share to gallery** / **Unshare from gallery**; calls PATCH to toggle `isPublic`.

4. **Gallery Page (src/app/gallery/page.tsx)**
   - Client component; fetch `/api/gallery` with optional `?tag=...&color=...`.
   - **Filter by tag**: Dropdown of tags (from initial full result or from a tags endpoint).
   - **Filter by color**: Preset color chips + native color input; “Clear color” to remove filter.
   - Show message when not logged in: “Sign in to save palettes to your library” with link.

5. **Gallery Grid (src/components/GalleryGrid.tsx)**
   - Receives `palettes`, `isLoggedIn`, `onCopy`, `onSave`.
   - Renders a responsive grid of **PaletteCard**s; empty state when no palettes.

6. **Palette Card (src/components/PaletteCard.tsx)**
   - Props: `palette` (name, colors, tags, description, _id), `onCopy`, `onSave`, `isLoggedIn`.
   - Display: name, description, tags, **color swatches with hex codes**.
   - **One-click Copy**: Copy palette `colors` (e.g. JSON array) to clipboard; show “Copied!” feedback.
   - **One-click Save**: Only if logged in; open `SavePaletteModal` with palette name, description, tags pre-filled so user can save to library.

7. **Nav**
   - Add **Gallery** link (visible to all) so the gallery is easy to find.

### Why I Did It This Way

- **Dedicated gallery API** keeps public browsing separate from private palette APIs and allows unauthenticated access with tag/color filters.
- **Filter by tag and color** matches the requirement; tag from query, color by normalizing hex and matching against `colors` array.
- **One-click copy** gives instant reuse (e.g. paste into code); **one-click save** reuses the existing Save modal and POST `/api/palette`, so logged-in users get the palette in their library without re-typing.
- **Share from Library** makes “chosen to share publicly” explicit and keeps the gallery populated by user action.
