# Maka frontend stack — Base UI + shadcn/ui + Tailwind v4 cheatsheet

> Single-page reference for the three agents (yuejing / xuan / kenji)
> working on Maka's UI refactor. Internalize before writing any
> renderer code so we don't drift back to Radix / Tailwind v3 patterns.
>
> Last revised: 2026-06-18.
> Sources distilled here:
> - `ThunderboltDev/shadcn-baseui` (`asChild` → `render` migration rules)
> - `secondsky/claude-skills/tailwind-v4-shadcn` (production v4 setup gotchas)
> - https://base-ui.com/ component docs
> - https://ui.shadcn.com/docs/tailwind-v4
> - Maka's current `components.json` + `apps/desktop/src/renderer/styles.css`

---

## 1. Stack identity

| Concern | Choice | Notes |
|---|---|---|
| Tailwind | **v4.x** via `@tailwindcss/vite` | No `tailwind.config.ts`. `components.json` carries `"config": ""`. |
| Headless primitives | **`@base-ui/react`** | Radix successor. Components use `render={...}` slot, NOT `asChild`. |
| Visual layer | shadcn-style copy-paste, locally owned in `packages/ui/src/ui.tsx` | Style key in `components.json`: `base-nova` (one of `base-vega` / `base-nova` / `base-maia` / `base-lyra` / `base-mira`). |
| Variants | `class-variance-authority` (`cva`) | Wraps each visual variant. |
| Class merging | `cn()` from `@maka/ui` (= `clsx + tailwind-merge`) | Reused everywhere. Don't reimplement. |
| Icons | `lucide-react` | `iconLibrary: "lucide"` in `components.json`. |
| Fonts | `@fontsource-variable/geist` + `geist-mono` | Mapped via `@theme inline --font-sans / --font-mono`. |
| Colors | `oklch()` tokens in `maka-tokens.css` | NOT `hsl()`. v4 supports both; we picked oklch for perceptual uniformity. |

**Components.json that ships today** (`/components.json`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "apps/desktop/src/renderer/styles.css",
                "baseColor": "zinc", "cssVariables": true, "prefix": "" },
  "aliases": { "components": "@maka/ui", "utils": "@maka/ui" },
  "iconLibrary": "lucide"
}
```

The `style: base-*` prefix is the gate: shadcn CLI generates Base UI
patterns (not Radix) when it sees that.

---

## 2. The four Base UI rules (every agent must obey)

These are the load-bearing diff between Radix muscle memory and the
Base UI reality. If you find yourself typing `asChild` in this repo —
stop, you're in Radix mode.

### 2.1 Slot: `render`, never `asChild`

Applies to: every Trigger / wrapping primitive (Dialog, AlertDialog,
Popover, DropdownMenu, Tooltip, Select, Tabs, Accordion), Button when
wrapping a Link, etc.

```tsx
// ❌ Radix muscle memory
<DialogTrigger asChild>
  <Button variant="outline">打开</Button>
</DialogTrigger>

// ✅ Base UI
<DialogTrigger render={<Button variant="outline" />}>
  打开
</DialogTrigger>

// ✅ Also fine — render owns the full subtree
<DialogTrigger render={<Button variant="outline">打开</Button>} />
```

### 2.2 Button as a non-button → `nativeButton={false}`

```tsx
// ❌ Radix
<Button asChild variant="ghost">
  <a href="/dashboard">仪表板</a>
</Button>

// ✅ Base UI
<Button render={<a href="/dashboard" />} variant="ghost" nativeButton={false}>
  仪表板
</Button>
```

Why: Base UI's Button assumes `<button>` semantics (keyboard role,
form-submit). When it renders as `<a>` or any other tag, we have to
opt out, otherwise click-to-submit on a wrapping `<form>` would fire.

### 2.3 Accordion: no `type`, use `multiple` boolean + array `defaultValue`

```tsx
// ❌ Radix single
<Accordion type="single" defaultValue="item-1">
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>

// ✅ Base UI single
<Accordion defaultValue={["item-1"]}>
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>

// ❌ Radix multiple
<Accordion type="multiple" defaultValue={["item-1", "item-2"]}>
  ...
</Accordion>

// ✅ Base UI multiple
<Accordion multiple defaultValue={["item-1", "item-2"]}>
  ...
</Accordion>
```

`defaultValue` is ALWAYS an array in Base UI, even in single mode.

### 2.4 Select: no `position`, use `alignItemWithTrigger` boolean

```tsx
// ❌ Radix
<SelectContent position="popper">...</SelectContent>

// ✅ Base UI (default = true)
<SelectContent alignItemWithTrigger={false}>...</SelectContent>
```

`alignItemWithTrigger` true (default) aligns the selected item with
the trigger; false floats the popup below.

---

## 3. The four Tailwind v4 rules (every agent must obey)

These are the production gotchas that cost a day if you skip them.

### 3.1 `:root` and `.dark` live at root level, NOT inside `@layer base`

```css
/* ❌ Wrong — v4 ignores tokens inside @layer base */
@layer base {
  :root { --background: oklch(0.985 0.003 250); }
}

/* ✅ Correct — root level */
:root { --background: oklch(0.985 0.003 250); }
.dark { --background: oklch(0.21  0.006 250); }
```

Maka's `maka-tokens.css` already follows this. Don't regress.

### 3.2 `@theme inline` is mandatory if you want utility classes

Without it, `bg-background` / `text-primary` etc. won't exist.

```css
/* styles.css */
@import "tailwindcss";
@import "./maka-tokens.css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary:    var(--accent);
  /* ...map EVERY semantic token here. */
}
```

Note: inside `@theme inline { … }` we use bare `var(--background)`,
NOT `oklch(var(--background))` and NOT `hsl(var(--background))`. The
wrapper goes in the token definition, not in the mapping.

### 3.3 No double-wrap

```css
/* ❌ Double wrap — color comes out broken */
body { background-color: oklch(var(--background)); }

/* ✅ Plain var ref */
body { background-color: var(--background); }
```

Maka grep confirms zero `oklch\s*\(\s*var\(` / `hsl\s*\(\s*var\(`
occurrences as of 2026-06-18. Keep it that way.

### 3.4 Banned packages

Do NOT install:

- `tailwindcss-animate` — deprecated in v4
- `tw-animate-css` — never existed
- `tailwind.config.ts` — delete on sight (v4 ignores it)

Use native CSS keyframes / `transition-*` utilities / `data-[state=…]`
selectors for animation. Maka grep confirms none of the banned
packages are in any `package.json` as of 2026-06-18.

---

## 4. Maka-specific conventions

### 4.1 Where shared components live

- `packages/ui/src/ui.tsx` — shadcn-style wrappers around Base UI
  (`Button`, `Badge`, `Card`, `Checkbox`, `Dialog*`, `Input`,
  `Select*`, `Separator`, `Tabs*`, `Textarea`, `Tooltip*`).
- `packages/ui/src/components.tsx` — older hand-written wrappers
  still on legacy CSS, being phased out by task #56 / #57. As of
  the closing batches every visible action button, form input,
  textarea, and checkbox routes through the `ui.tsx` primitives.
- `packages/ui/src/utils.ts` — `cn()` helper.

Import via the `@maka/ui` barrel:

```ts
import { Button, DialogRoot, DialogContent, cn } from '@maka/ui';
```

### 4.2 Button variants today

`buttonVariants` in `ui.tsx` exposes:

- variant: `default | secondary | ghost | outline | destructive | quiet`
- size: `sm | md | lg | icon | icon-sm`

`quiet` = transparent background, muted-foreground, hover bg-muted —
use for icon close buttons inside dialogs / panels.

### 4.3 Dialog composition

`DialogContent` is the convenience wrapper that bundles
`DialogPortal + DialogBackdrop + DialogPopup` + an internal close
button (with `aria-label="关闭"`). Use it for most modals:

```tsx
<DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
  <DialogContent className="w-[min(96vw,640px)]">
    <DialogTitle>设置</DialogTitle>
    <DialogDescription>...</DialogDescription>
    {/* content */}
  </DialogContent>
</DialogRoot>
```

Pass `showClose={false}` when the surface owns its own close
control (e.g. Settings modal has the close button inside the page
header, so the Dialog-level close would double up).

### 4.4 Tabs

Base UI uses `data-[selected]` on `Tab` to mark the active tab.
Style accordingly:

```tsx
<TabsRoot defaultValue="general">
  <TabsList>
    <TabsTrigger value="general">通用</TabsTrigger>
    <TabsTrigger value="models">模型</TabsTrigger>
  </TabsList>
  <TabsPanel value="general">...</TabsPanel>
  <TabsPanel value="models">...</TabsPanel>
</TabsRoot>
```

The Maka `TabsTrigger` wrapper already includes
`data-[selected]:bg-background data-[selected]:text-foreground` —
don't reimplement.

### 4.5 Select

Base UI's Select composes via `BaseSelect.Icon /
BaseSelect.ItemIndicator / BaseSelect.ItemText`. Our wrapper
already injects the chevron icon and check indicator, so callers
just write:

```tsx
<SelectRoot value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="选择..." />
  </SelectTrigger>
  <SelectPortal>
    <SelectPositioner>
      <SelectPopup>
        <SelectItem value="a">A</SelectItem>
        <SelectItem value="b">B</SelectItem>
      </SelectPopup>
    </SelectPositioner>
  </SelectPortal>
</SelectRoot>
```

### 4.6 Don't reach for global `styles.css` for new components

The 8k-line `apps/desktop/src/renderer/styles.css` is being
incrementally trimmed. New components should use Tailwind utility
classes + `cn()`, NOT new CSS class blocks. The exception is the
`@theme inline` block (extend tokens) and the small `:root` /
`.dark` token files. Anything else → utilities only.

### 4.7 The `@source` glob

`styles.css` declares `@source "../../../../packages/ui/src";` so
Tailwind sees class names used inside `@maka/ui` and emits them.
If you add a new shared package that authors Tailwind classes, add
its src dir to the `@source` glob.

---

## 5. Skill inventory

Installed skills (under `.agents/skills/`):

- `shadcn-baseui` — rules covered above; auto-applied when style is
  `base-*`.
- `tailwind-v4-shadcn` — has the rules in §3 + deeper references
  in its own `references/` folder (`common-gotchas.md`, `dark-mode.md`,
  `migration-guide.md`, `plugins-reference.md`, `advanced-usage.md`).
  Load those when troubleshooting.

Discoverable but NOT installed (worth pulling if needed):

| Skill | Use case |
|---|---|
| `shadcn/improve@improve` | When polishing existing shadcn components — adds taste guardrails. |
| `wshobson/agents@tailwind-design-system` | When designing a new design system from scratch. |
| `expo/skills@expo-tailwind-setup` | If we ever ship a mobile / Expo client. |
| `vercel-labs/json-render@shadcn` | If we ever render LLM JSON as shadcn forms (Settings-from-spec). |
| `nocobase/skills@nocobase-ui-builder` | Out of scope; just on the radar. |

Discover more with:

```sh
npx skills find shadcn
npx skills find base-ui
npx skills find tailwind
```

Install with:

```sh
npx skills add <owner>/<repo>@<skill-name>
```

Skills sync into `.agents/skills/` which is gitignored. Each agent
installs locally; we don't commit them.

---

## 6. Quick lookup tables

### When migrating a Radix component to Base UI

| Radix construct | Base UI replacement | Notes |
|---|---|---|
| `<X.Trigger asChild>` | `<X.Trigger render={...}>` | §2.1 |
| `<Button asChild>` + `<a/>` | `<Button render={<a/>} nativeButton={false}>` | §2.2 |
| `<Accordion type="single">` | `<Accordion>` + array `defaultValue` | §2.3 |
| `<Accordion type="multiple">` | `<Accordion multiple>` | §2.3 |
| `<Select.Content position="popper">` | `<Select.Content alignItemWithTrigger={false}>` | §2.4 |
| `data-[state=open]` | `data-[open]` | Base UI drops the `state=` namespace on many primitives |
| `data-[state=active]` (Tabs) | `data-[selected]` | Tabs uses `selected`, not `active`. |

### When converting hand-written CSS components

| Old pattern | New pattern |
|---|---|
| New CSS rule in `styles.css` | Tailwind utility class on the JSX node |
| `.maka-button` class | `Button` from `@maka/ui` with `variant` prop |
| `border-radius` literal | `rounded-md` / `rounded-xl` etc. |
| `box-shadow: 0 1px 2px rgba(...)` | `shadow-maka-panel` (mapped in `@theme inline`) |
| `transition: background 120ms ease` | `transition-colors duration-150` |
| Manual `:focus-visible` outline | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| `[data-state="loading"]` | data attr selectors continue to work; just check Base UI's attribute name |

---

## 7. Audit findings (2026-06-18)

Performed when task #57 opened. All green:

- ✅ `components.json` exists with `"style": "base-nova"` + `"config": ""`
- ✅ No `tailwind.config.ts` in repo
- ✅ `:root` + `.dark` defined at root level in `maka-tokens.css`
- ✅ `@theme inline` maps every semantic token to a Tailwind utility
- ✅ Zero `oklch(var(--…))` / `hsl(var(--…))` double-wrap occurrences
- ✅ Zero `tailwindcss-animate` / `tw-animate-css` references
- ✅ Zero `asChild` occurrences in `apps/desktop/src` and `packages/`
- ✅ `cn()` reused, not reimplemented
- ✅ All Base UI Trigger wrappers use `render={…}` slot

Known leftovers (out of scope for this cheatsheet, tracked
under task #56 continuation):

- `packages/ui/src/components.tsx` still hosts legacy hand-written
  `Button` / form selectors that pre-date the `ui.tsx` migration.
- `apps/desktop/src/renderer/styles.css` still has large CSS blocks
  for surfaces not yet migrated (Sidebar / SearchModal sub-elements
  / Sessions list / Onboarding hero). They'll be deleted as each
  surface moves to utility classes.

## 8. 2026-06-19 closing-batch audit

After task #56 + #57 wound down with multi-agent batches, the
state of the codebase against this cheatsheet's rules:

- ✅ All visible **action buttons** (renderer + `components.tsx`)
  go through shared `UiButton` from `@maka/ui`. Raw `<button>`
  remains only where the element is semantically a nav row, a
  list-item row, a disclosure toggle, or an inline prose route
  (Markdown `maka://` link).
- ✅ All **form inputs / textareas / selects** in Settings,
  ProvidersPanel, PlanReminderPanel, Composer, Onboarding,
  BrowserPanel, and CommandPalette route through `@maka/ui`
  `Input / Textarea / Select*`. The PlanReminder
  `recurrence / delivery / platform` native selects landed last,
  under xuan's round-4 batch.
- ✅ **PermissionDialog checkbox** (the last raw
  `<input type="checkbox">` in any renderer JSX) migrated to the
  new shared `Checkbox` primitive (round-3 batch added
  `Checkbox` to `ui.tsx`).
- ✅ **Zero `asChild`** anywhere in `apps/desktop/src` or
  `packages/`. All Base UI Triggers use `render={...}`.
- ✅ Source-grep contracts (`renderer-utility-primitives-contract`,
  `settings-form-a11y-contract`, `plan-reminder-contract`,
  `bot-settings-ui-contract`, `model-oauth-section-contract`,
  `renderer-error-boundary`) actively forbid regressions of the
  migrated surfaces back to raw HTML controls.
- ⏳ **Deferred by team consensus:** wholesale removal of the
  legacy `.maka-button*` CSS blocks in `styles.css`. The class
  is still added to migrated `UiButton` callers as a
  presentation fallback; deletion happens after the last lane
  closes.

## 9. 2026-06-19 closing-batch addendum (COSS + QoderWork-layout series)

Outcome of the 10-round QoderWork-layout / COSS-familiarization
reminders WAWQAQ scheduled (anchor msg `fa5f40d3`):

### 9.1 What `Alert` and `Empty` are for vs. not

COSS `Alert` (variant=`info / warning / error`) replaces every
hand-rolled `.maka-*-error` / `.maka-*-banner` / `.maka-*-notice`
that takes a full row across a pane. Confirmed migrations:

- `PermissionDialog` danger + stale notes
- `Daily Review` refresh-failure banner
- `ToolErrorBanner`
- `fake-backend` banner
- `FirstRunChecklist` two error states
- `artifact-list-error` row

Rule: if the prose is "something went wrong / be careful / FYI",
it is an Alert. Title is short imperative, description is the
recovery hint, action goes into `<AlertAction>`.

COSS `Empty` (with `EmptyHeader + EmptyMedia variant="icon" +
EmptyTitle + EmptyDescription`) replaces hand-rolled column-flex
empty states **only at pane/region scope**. Confirmed migrations:

- `browser-panel` "嵌入式浏览器" overlay (Globe icon)
- `command-palette` "没有匹配的命令" results panel (Search icon)
- `artifact-pane` "暂未选中文件" preview pane (FileText icon)
- `EmptyState` shared component (`packages/ui/src/components.tsx`)
  already routed through `Empty` since round 2

### 9.2 When NOT to use Empty

Inline cell-level "no results" messages stay as `<small>` /
`<p>` / `<strong>` — they preserve dense Settings rhythm. Empty
imposes `flex-col items-center gap-6 px-6 py-12` which is too
heavy for inline contexts.

Deliberately **kept inline**, audited 2026-06-19:

- `ProvidersPanel:1912/1918` — model table inline empty / no-results
- `SettingsModal:2917` — `settingsConnectionMeta` "没有结果。"
- `SettingsModal:3786` — memory items search empty (`role="status"`
  in-list message)
- `SettingsModal:6093` — capability audit log `<small>暂无审计记录。</small>`

If you migrate any of these later, override the padding to `py-3
gap-2` and drop EmptyMedia, otherwise the cell grows to ~140px tall.

### 9.3 QoderWork imitation boundary (2026-06-19 WAWQAQ correction)

Per `[msg=246a09a9]`: imitate **layout structure**, not
identity. We borrow:

- single-column centered hero arrangements
- info hierarchy (eyebrow → headline → intro → composer/actions)
- control combinations (Switch on / Menu actions / Card grid)
- motion / state expression patterns (Alert banners, Empty cards)

We do **not** copy:

- mascots / illustration characters
- brand visual assets, logos, or recognizable identity marks
- task / channel tab split (Maka stays mixed)

The OnboardingHero brand-mark revert (`6a22e77`) is the canonical
example: the centered `.maka-onboarding-ready header` layout
stays, the 56×56 gradient "M" disk was removed.

### 9.4 COSS vendoring pattern (recap from round 1)

Components live in `packages/ui/src/coss/`. Each file is a
verbatim copy from `cosscom/coss` with two sed-style rewrites:

```
@coss/ui/lib/utils                → ../utils.js
@coss/ui/components/<name>        → ./<name>.js
@coss/ui/hooks/use-media-query    → ./use-media-query.js
```

`scripts/check-a11y.mjs` skips `coss/` (English aria-labels get
localized at the consuming surface). `calendar.tsx` is omitted
because we don't ship `react-day-picker`. New COSS components
re-export from `packages/ui/src/index.ts` so renderers consume
them as `import { Alert, Empty, … } from '@maka/ui'`.
