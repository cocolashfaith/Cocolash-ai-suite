# Coding Conventions

**Analysis Date:** 2026-05-01

## Naming Patterns

**Files:**
- Components: PascalCase with `.tsx` extension (e.g., `TabsList`, `TabsTrigger`)
- API routes: kebab-case directories with `route.ts` (e.g., `app/api/costs/route.ts`, `app/api/product-categories/route.ts`)
- Utility/library files: camelCase with `.ts` extension (e.g., `utils.ts`, `client.ts`, `tracker.ts`, `generate.ts`)
- Type definition files: `index.ts` for barrel exports (e.g., `lib/types/index.ts`, `lib/blotato/types.ts`)
- Scripts: camelCase with `ts` extension for standalone scripts (e.g., `test-hashtag-selector.ts`, `seed-hashtags.ts`)

**Functions:**
- camelCase for all function names (e.g., `getMonthlyCostSummary`, `createClient`, `fetchHashtags`, `addUnique`)
- Exported async functions use `async function` syntax (e.g., `export async function GET()`, `export async function PUT()`)
- Private/internal functions use same camelCase convention as exported ones
- Callback/handler functions use descriptive names with clear purpose (e.g., `updateSession`, `selectHashtagsTest`)

**Variables:**
- camelCase for all variable declarations (e.g., `geistSans`, `authCookie`, `selectedTags`, `brandProfile`)
- Constants that are module-level exported use UPPER_SNAKE_CASE (e.g., `PLATFORM_LIMITS`, `DEFAULT_TONE_KEYWORDS`, `BRAND_COLORS`)
- Constants that are scoped to a function use camelCase
- Short-lived loop variables allowed in lowercase (e.g., `for (const field of allowedFields)`)

**Types:**
- Interfaces: PascalCase (e.g., `GroupDiversitySelections`, `BlotatoAccount`, `ImageContext`)
- Type aliases: PascalCase (e.g., `ContentCategory`, `SkinTone`, `LashStyle`, `Composition`)
- Union types: use `type` with pipe syntax (e.g., `type LashStyle = "natural" | "volume" | "dramatic"`)
- Generic types: use single letter or descriptive names (e.g., `ApiResponse<T>`, `Repository<T>`)

## Code Style

**Formatting:**
- No explicit formatter configured; rely on editor defaults and TypeScript strict mode
- Indentation: 2 spaces (observed in all source files)
- Line length: no explicit limit enforced
- Semicolons: required at statement ends (TypeScript strict)
- Quote style: double quotes for strings (observed throughout)

**Linting:**
- ESLint with Next.js recommended config: `eslint-config-next` (core-web-vitals + typescript)
- Config file: `eslint.config.mjs`
- Run: `npm run lint` (no watch mode configured)
- Uses modern flat config format (ESLint 9+)
- Ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

**TypeScript Configuration:**
- Target: ES2017
- Strict mode: enabled (`"strict": true`)
- JSX: react-jsx
- Module resolution: bundler
- Path aliases: `@/*` maps to project root for absolute imports
- `skipLibCheck`: true (skip type checking of declaration files)
- `isolatedModules`: true (treat each file as separate module)

## Import Organization

**Order:**
1. React/Next.js imports (e.g., `import type { Metadata } from "next"`)
2. Third-party library imports (e.g., `import { createClient } from "@supabase/supabase-js"`)
3. Relative imports from project modules (e.g., `import { cn } from "@/lib/utils"`)
4. CSS/styles (e.g., `import "./globals.css"`)

**Path Aliases:**
- `@/*`: Maps to project root—use for all local imports
- Enables clean absolute imports: `@/lib/utils`, `@/components/ui/tabs`, `@/lib/types`

**Type imports:**
- Use `import type` for type-only imports to avoid circular dependencies
- Observed in component files: `import type { VariantProps } from "class-variance-authority"`
- Observed in layout: `import type { Metadata } from "next"`

## Error Handling

**Patterns:**
- All API route handlers wrap logic in `try-catch` blocks
- Catch clause always uses `error: unknown` to force safe narrowing
- Error narrowing: check `error instanceof Error` before accessing `.message`
- Console.error logging on every catch: `console.error("[context] Error:", error)`
- Return NextResponse.json with error message and 500 status code on failure
- Example from `app/api/costs/route.ts`:
  ```typescript
  try {
    const summary = await getMonthlyCostSummary(year, month);
    return NextResponse.json(summary);
  } catch (error: unknown) {
    console.error("[costs] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch cost summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  ```

**Database errors:**
- Supabase-specific error codes checked (e.g., `error.code !== "PGRST116"` for "no rows returned")
- Logging with error details: `console.error("Error seeding brand profile:", insertError)`

## Logging

**Framework:** `console.error()` for error logging only

**Patterns:**
- Error logging: Use context prefix in square brackets + "Error:" (e.g., `console.error("[costs] Error:", error)`)
- API context logging: Include route path in prefix (e.g., `"[settings/blotato]"`, `"[captions/generate]"`)
- No `console.log` or `console.info` in production code (observed throughout)
- Error logs include the full error object after colon for debugging

## Comments

**When to Comment:**
- Function documentation: JSDoc blocks above exported functions and async route handlers
- Complex logic: inline comments explaining "why" not "what"
- Supabase error codes: explain specific error codes (e.g., `// PGRST116 = "no rows returned"`)
- API documentation: describe endpoint purpose, parameters, and behavior
- Special handling: note non-obvious control flow (e.g., "Auth middleware will catch unauthenticated users")

**JSDoc/TSDoc:**
- Used extensively on API route handlers
- Observed format:
  ```typescript
  /**
   * GET /api/brand — Fetch the brand profile.
   *
   * Returns the first (and only) brand profile from the database.
   * If no profile exists, auto-seeds the default CocoLash profile.
   */
  export async function GET() { ... }
  ```
- Parameter documentation with `@param` tags (e.g., in `lib/gemini/generate.ts`)
- Return type documentation with `@returns` tags

## Function Design

**Size:** Functions span 10-50 lines; larger functions for API routes (may include full request/response cycle)

**Parameters:**
- API handlers: `(request: NextRequest)` or `()` for GET without params
- Utility functions: typed parameters with explicit types (not `any`)
- Async functions: always return `Promise<T>` with explicit type
- Callbacks: explicitly typed (e.g., `onSelect: (id: string) => void`)

**Return Values:**
- Async API handlers: return `NextResponse` with `.json()` for data or errors
- Promise-returning functions: explicit return type annotation
- Utility functions: return specific types, not `any` or `void` (unless intentional)
- Error boundaries: functions that may fail wrap in try-catch and return error responses

## Module Design

**Exports:**
- Use named exports for functions, types, interfaces, and constants
- Barrel files (`index.ts`) re-export public API from subdirectories
- Type files (`lib/types/index.ts`) export all type definitions for entire app
- No default exports (consistent throughout)

**Barrel Files:**
- `lib/types/index.ts` — Central type system for entire application
- Component subdirectories export individual files without barrel

**File organization:**
- API routes: one handler per `route.ts` file following Next.js convention
- Components: one component per file (e.g., `Tabs`, `TabsList`, `TabsTrigger` each get their own export)
- Libraries: group by domain (e.g., `lib/gemini/`, `lib/seedance/`, `lib/costs/`)

---

*Convention analysis: 2026-05-01*
