# Design system

Cockpit uses a design language derived from Wise: one lime-green accent on a sage canvas, near-black
ink, heavy display type and 24px-rounded cards and buttons.

## How it maps to code

Everything lives in `packages/ui/src/styles/globals.css`. Use these tokens and don't hard-code hex
values in components.

| Spec token                         | Tailwind utility                                                     | Notes                                                         |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `colors.primary` `#9fe870`         | `bg-primary` / `bg-wise-green`                                       | CTA only. Text on it is `text-primary-foreground` (ink-deep). |
| `colors.primary-active` `#cdffad`  | `bg-wise-green-active`                                               | Primary button hover.                                         |
| `colors.primary-pale` `#e2f6d5`    | `bg-wise-green-pale`                                                 | Soft badges, positive callouts.                               |
| `colors.canvas-soft` `#e8ebe6`     | `bg-background` / `bg-canvas-soft`                                   | Page canvas, sidebar.                                         |
| `colors.canvas` `#ffffff`          | `bg-card` / `bg-canvas`                                              | Cards on the sage canvas.                                     |
| `colors.ink` `#0e0f0c`             | `text-foreground` / `text-ink` / `bg-ink`                            | Text; dark promo cards (`bg-ink text-primary`).               |
| `colors.body` `#454745`            | `text-body` / `text-muted-foreground`                                | Secondary text.                                               |
| `colors.mute` `#868685`            | `text-mute`                                                          | Captions, placeholders.                                       |
| Semantic positive/warning/negative | `text-positive`, `bg-warning`, `bg-negative-bg`, …                   | In-product status. **Never use Wise green for success.**      |
| `rounded.sm/md/lg/xl`              | `rounded-sm` 8 · `rounded-md` 12 · `rounded-lg` 16 · `rounded-xl` 24 | Buttons and cards use `rounded-xl`; inputs use `rounded-md`.  |
| Display type                       | `font-display text-display-{mega,xxl,xl,md}`                         | Manrope 800 stands in for Wise Sans 900.                      |
| Sub-display / body                 | `text-display-{sm,xs}`, `text-body-{lg,md,sm}`, `text-caption`       | Inter.                                                        |

Component variants already follow the spec:

- `<Button>`: `default` (green pill), `secondary` (sage), `outline` (white with an ink border),
  `dark` (ink with green text), `ghost`, `destructive`, `link`. Buttons are 48px tall by default.
- `<Input>`: 48px tall, 1px ink border, 12px radius.
- `<Card>`: white, 24px radius, no border or shadow. The contrast with the canvas provides the
  elevation.

## Motion

We follow Emil Kowalski's rules (see the `emil-design-eng` and `review-animations` skills in
`.claude/skills`):

- Use the strong curves from the theme: `ease-out` is `cubic-bezier(0.23, 1, 0.32, 1)` and
  `ease-in-out` is `cubic-bezier(0.77, 0, 0.175, 1)`. Never use `ease-in` for UI.
- Keep UI motion under 300ms. Button press feedback is 150ms with `active:scale-[0.97]`.
- Don't animate actions people trigger often or from the keyboard.
- Gate movement behind `motion-safe:`. Opacity fades can stay.

---

## Source spec (Wise)

Wise wears its identity in a single signature pairing: a vivid lime-green `{colors.primary}`
(`#9fe870`) used as the CTA pill and brand accent, set against a pale sage-tinted canvas
`{colors.canvas-soft}` (`#e8ebe6`), and a near-black ink `{colors.ink}` (`#0e0f0c`). It reads more
like a calm Scandinavian magazine than a bank: generous whitespace, large rounded cards, and a very
heavy display sans.

### Key characteristics

- A single lime-green CTA accent. No second accent.
- Two-face typography: a heavy display face for brand moments and Inter 600 for everything else.
- `{rounded.xl}` 24px is the canonical card and button radius.
- Sage canvas for the page, white for cards within it.
- A full semantic palette (positive / warning / negative) for in-product status.

### Colors

| Token            | Hex       | Use                                         |
| ---------------- | --------- | ------------------------------------------- |
| primary          | `#9fe870` | Every primary CTA                           |
| primary-active   | `#cdffad` | Active/hover state                          |
| primary-neutral  | `#c5edab` | Neutral active fill                         |
| primary-pale     | `#e2f6d5` | Soft surface tints, badge backgrounds       |
| canvas           | `#ffffff` | Card interiors                              |
| canvas-soft      | `#e8ebe6` | Page background                             |
| ink              | `#0e0f0c` | Default text and headings                   |
| ink-deep         | `#163300` | Text on green / positive surfaces           |
| body             | `#454745` | Secondary body text                         |
| mute             | `#868685` | Captions, placeholder, fine print           |
| positive         | `#2ead4b` | Success                                     |
| positive-deep    | `#054d28` | Pressed positive                            |
| warning          | `#ffd11a` | Caution                                     |
| warning-deep     | `#b86700` | Pressed warning                             |
| warning-content  | `#4a3b1c` | Text on warning surfaces                    |
| negative         | `#d03238` | Destructive / error                         |
| negative-deep    | `#a72027` | Pressed destructive                         |
| negative-darkest | `#a7000d` | Highest-emphasis destructive text           |
| negative-bg      | `#320707` | Destructive callout background (white text) |
| accent-orange    | `#ffc091` | Illustration only                           |
| accent-cyan      | `#38c8ff` | Illustration only                           |

### Typography

| Token        | Size  | Weight | Line height | Letter spacing | Use                      |
| ------------ | ----- | ------ | ----------- | -------------- | ------------------------ |
| display-mega | 126px | 900    | 107.1px     | 0              | Hero at maximum scale    |
| display-xxl  | 96px  | 900    | 81.6px      | 0              | Sub-hero                 |
| display-xl   | 64px  | 900    | 54.4px      | 0              | Standard hero headline   |
| display-lg   | 47px  | 400    | 70.5px      | -0.108px       | Lighter sub-display      |
| display-md   | 40px  | 900    | 34px        | 0              | Section / card headlines |
| display-sm   | 32px  | 600    | 38.4px      | -0.96px        | Inter section headings   |
| display-xs   | 24px  | 600    | 31.2px      | -0.48px        | Sub-section displays     |
| body-lg      | 20px  | 400    | 30px        | 0              | Lead paragraphs          |
| body-md      | 16px  | 400    | 24px        | 0              | Default body             |
| body-sm      | 14px  | 400    | 20px        | 0              | Secondary body           |
| caption      | 12px  | 400    | 16px        | 0              | Fine print               |
| button-md    | 16px  | 600    | 24px        | 0              | Button label             |

Use the heavy weight for display type and 600 for everything below it.

### Layout

- 4px base unit. Spacing tokens: 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Cards have 24px of interior padding. Section bands have 48px of vertical padding.
- Breakpoints: mobile under 768px (1-up), tablet from 768px to 1023px (2-up), desktop from 1024px.
- Touch targets are about 48px.

### Elevation

Level 0 is flat. Level 1 is a 1px ink hairline (outline buttons, inputs). Level 2 is a white card on
the sage canvas, where the surface contrast is the elevation. Modals and toasts get a soft shadow.

### Components

- **button-primary**: primary bg, ink-deep text, 12px × 24px padding, 24px radius.
- **button-secondary**: canvas-soft bg, ink text.
- **button-tertiary**: white bg, ink text, 1px ink border.
- **button-icon-circular**: white bg, fully round.
- **card-content**: white, 24px padding, 24px radius, no border.
- **card-feature-sage / -green / -dark**: canvas-soft, primary-pale, or ink with green text.
- **text-input**: white, 1px ink border, 12px × 16px padding, 12px radius.
- **badge-positive**: primary-pale bg, positive-deep text, pill.
- **badge-negative**: negative-bg bg, white text, pill.
- **App shell row**: sidebar nav row. The active state uses primary as the indicator.

### Do

- Reserve Wise green for primary CTAs.
- Set heroes in the heavy display weight.
- Use the 24px radius for buttons and cards.
- Alternate sage canvas and white cards.
- Use the semantic palette for status.

### Don't

- Introduce a second brand accent.
- Render display type at 700 or lighter.
- Make CTAs sharp rectangles.
- Put the green CTA on a green background. Green sits on sage, white or ink.
