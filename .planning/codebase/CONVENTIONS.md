# Coding Conventions

**Analysis Date:** 2026-05-31

## Naming Patterns

**Files:**
- Lowercase with hyphens: `lib/chat/rate-limit.ts`, `lib/openrouter/chat.ts`, `components/gallery/index.tsx`
- Test files: `*.test.ts` or `*.test.tsx` (e.g., `lib/log.test.ts`, `lib/shopify/cache.test.ts`)
- Export utilities: `lib/utils.ts` for shared helpers
- Type definitions: `lib/types/index.ts`, `lib/blotato/types.ts`
- Error classes: `lib/chat/error.ts`, `lib/gemini/safety.ts`, etc.

**Functions & Methods:**
- camelCase for all functions: `parseIntent`, `streamChat`, `getAccounts`, `composeUserMessage`
- Export public functions explicitly
- Private methods use leading underscore rarely; use scope instead
- Factory functions: `makeLogger`, `getOpenRouterClient`
- Async function names do not need "async" prefix; return type is `Promise<T>`

**Variables & Constants:**
- camelCase for local variables: `fullText`, `inputTokens`, `baseInput`, `payload`
- UPPERCASE for readonly module-level constants: `CHAT_MODEL`, `INTENT_LABELS`, `INTENT_SYSTEM_PROMPT`, `LEVELS`
- All constants use `as const` when appropriate for type narrowing

**Types:**
- PascalCase for all types and interfaces: `Logger`, `ChatError`, `BlotatoClient`, `DirectorInput`
- Interface prefix convention: No "I" prefix (use `Logger` not `ILogger`)
- Type aliases for unions and complex shapes: `type IntentLabel = "product" | "tryon" | "order" | "support" | "lead_capture" | "other"`
- Database records follow snake_case columns but TypeScript types are PascalCase: `interface GeneratedImage { id: string; brand_id: string; ... }`
- Readonly generic aliases: `ReadonlyArray<T>` for immutable collections

## Code Style

**Formatting:**
- ESLint: `eslint` (v9) configured via `eslint.config.mjs`
- Config extends: `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- No Prettier config detected; uses ESLint only
- 2-space indentation (TypeScript/ESM default)

**Linting:**
- ESLint config: `cocolash-ai/eslint.config.mjs`
- Rules from Next.js defaults: core-web-vitals and typescript extensions
- Global ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`
- Run: `npm run lint`

**Type Safety:**
- TypeScript: `^5` with `strict: true` in `tsconfig.json`
- Target: `ES2017` compiled to `esnext` modules
- JSX: `react-jsx` (automatic JSX transform)
- Module resolution: `bundler` for modern ESM
- Path aliases: `@/*` → root directory for absolute imports
- No `any` in application code; use `unknown` with type narrowing or generics

## Import Organization

**Order:**
1. Node.js built-ins (`path`, `fs`, etc.)
2. Third-party packages (`openai`, `zod`, `vitest`)
3. Internal imports (`@/lib/...`, `./relative`)
4. Type imports: `import type { X }` on same group

**Path Aliases:**
- `@/*` resolves to project root: `@/lib/chat/error` → `./lib/chat/error.ts`
- Used consistently across all source files, components, and tests

**File Organization:**
```typescript
// 1. Imports (absolute @/, then relative ./)
import { openrouterRequest } from "./client"
import type { IntentLabel } from "@/lib/types"

// 2. Constants (UPPERCASE)
export const INTENT_LABELS = [...]
export const INTENT_SYSTEM_PROMPT = `...`

// 3. Types & Interfaces
export interface ClassifyOptions { ... }
export interface Logger { ... }

// 4. Private helpers (no export)
function currentThreshold(): number { ... }
function makeLogger(base: Record<string, unknown>): Logger { ... }

// 5. Exported functions
export async function classifyIntent(...): Promise<{ ... }> { ... }
export function parseIntent(raw: string): IntentLabel { ... }
```

## Error Handling

**Pattern:**
- Custom error classes extend `Error` with typed `code` property
- Example: `lib/chat/error.ts` defines `ChatError` with `code: ChatErrorCode`
- Status codes included: `{ status: number; code: string; message: string }`
- Catch blocks use `if (error instanceof SpecificError)` for narrowing
- Unknown errors wrapped safely: `catch (error: unknown) => { ... }`

**Transient Errors:**
- Retry logic for 429 (rate limit): exponential backoff with `setTimeout`
- Example: `lib/blotato/client.ts` retries 429 responses with 2-second delay
- Non-fatal errors logged with `log.error()` but don't block flow

**Error Propagation:**
- API routes catch service errors and translate to HTTP status + JSON response
- Example: `ChatError` with status 500, 400, 403 mapped to HTTP responses
- Defaults to safe fallback (e.g., `classifyIntent` returns "other" on error)

## Logging

**Framework:** Custom JSON logger in `lib/log.ts`

**Interface:**
```typescript
export interface Logger {
  debug: (msg: string, fields?: Record<string, unknown>) => void
  info: (msg: string, fields?: Record<string, unknown>) => void
  warn: (msg: string, fields?: Record<string, unknown>) => void
  error: (msg: string, fields?: Record<string, unknown>) => void
  child: (extras: Record<string, unknown>) => Logger
}
```

**Levels & Threshold:**
- Levels: `debug < info < warn < error`
- Environment variable: `LOG_LEVEL` (default: `debug` in dev, `info` in prod)
- Output: JSON to stdout (all levels), errors to stderr
- Timestamps: ISO 8601 format

**Usage:**
```typescript
import { log } from "@/lib/log"

log.info("Processing started", { userId: "abc", campaignId: 123 })
log.error("Database query failed", { table: "users", err: e.message })

// Child loggers carry context
const child = log.child({ requestId: "req-123" })
child.info("Request handled") // Includes requestId in output
```

**Note on console.log:**
- Legacy `console.log` and `console.error` calls remain in code (`lib/costs/tracker.ts`, `lib/seedance/completion.ts`)
- New code should use `lib/log.ts` logger
- CONCERNS.md tracks migration gap

## Comments

**When to Comment:**
- File headers: Purpose and decisions referenced (e.g., Decision D-02, D-11)
- Complex logic: Explain non-obvious intent and constraints
- Deprecated patterns: Why something is done a certain way
- Example: `lib/log.ts` file header explains levels, environment config, and M1/M2 status

**JSDoc/TSDoc:**
- Used sparingly for public APIs
- Example: `lib/openrouter/chat.ts` documents `StreamChatOptions` interface
- Comments on exported functions rarely needed if types are clear

**Format:**
```typescript
/**
 * lib/path/file.ts — Brief description.
 *
 * Longer explanation of purpose and architectural decisions.
 * References: Decision D-02, CONCERNS.md item #3.
 */

/**
 * Brief description of function.
 *
 * Optional longer explanation.
 * @param x — parameter description
 * @returns description
 */
export function doThing(x: string): Promise<Result> { ... }
```

## Function Design

**Size:** Aim for single responsibility; most functions 20–50 lines

**Parameters:**
- Name explicit types: `parseIntent(raw: string): IntentLabel`
- Use interfaces for multi-parameter functions: `streamChat(opts: StreamChatOptions)`
- Make optional params explicit: `model?: string` or options object `{ model?: string }`
- No parameter defaults that hide intent; use options interface instead

**Return Values:**
- Always explicit return type: `Promise<T>`, `T | null`, `readonly T[]`
- For async: return `Promise<T>` not bare `T` (JavaScript default)
- Null/undefined preferred over empty arrays for "not found": `T | null`

**Example:**
```typescript
export async function classifyIntent(
  message: string,
  options: ClassifyOptions = {}
): Promise<{
  intent: IntentLabel
  inputTokens: number | null
  outputTokens: number | null
}> {
  // Single responsibility: classify one message
  // Complex return wrapped in typed interface
  // Options pattern for extensibility
}
```

## Module Design

**Exports:**
- One main export per file when possible: `export class BlotatoClient { ... }`
- Multiple types exported from index files: `lib/types/index.ts` exports 100+ types
- Avoid mixing exported function, types, and constants in single file unless related

**Barrel Files:**
- Minimal use; most imports direct to specific files
- Example: `lib/types/index.ts` is a central registry, not a barrel export

**Class Pattern:**
- Classes for stateful services: `BlotatoClient`, `LruCache`, `RateLimiter`
- Constructor takes config: `new BlotatoClient(apiKey)`
- Private methods use `private` keyword
- Example: `lib/blotato/client.ts` encapsulates API requests with retry logic

**Service Functions:**
- Stateless factories: `getOpenRouterClient()` returns configured OpenAI client
- Pure functions: `parseIntent(raw)`, `cn(...inputs)` for class merging
- Async service calls: `classifyIntent()`, `streamChat()`, `getAccounts()`

## Test Patterns

See TESTING.md for dedicated test conventions.

---

*Convention analysis: 2026-05-31*
