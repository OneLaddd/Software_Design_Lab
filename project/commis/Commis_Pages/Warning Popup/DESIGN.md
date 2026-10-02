---
name: Electric Dark Bounty
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#cdc7aa'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#979177'
  outline-variant: '#4b4731'
  surface-tint: '#dec800'
  primary: '#ffffff'
  on-primary: '#373100'
  primary-container: '#fde400'
  on-primary-container: '#716500'
  inverse-primary: '#6a5f00'
  secondary: '#c8c6c8'
  on-secondary: '#303032'
  secondary-container: '#474649'
  on-secondary-container: '#b6b4b7'
  tertiary: '#ffffff'
  on-tertiary: '#303033'
  tertiary-container: '#e4e1e5'
  on-tertiary-container: '#656467'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#fde400'
  primary-fixed-dim: '#dec800'
  on-primary-fixed: '#201c00'
  on-primary-fixed-variant: '#504700'
  secondary-fixed: '#e4e2e4'
  secondary-fixed-dim: '#c8c6c8'
  on-secondary-fixed: '#1b1b1d'
  on-secondary-fixed-variant: '#474649'
  tertiary-fixed: '#e4e1e5'
  tertiary-fixed-dim: '#c8c6c9'
  on-tertiary-fixed: '#1b1b1e'
  on-tertiary-fixed-variant: '#47464a'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies high-energy creator economies, bounties, and creative gig commissions. It delivers a punchy, nocturnal aesthetic where deep obsidian surfaces contrast against radiant electric yellow highlights.

### Target Audience & Emotional Tone
Designed for digital creatives, independent hunters, artists, developers, and commissioners. The atmosphere evokes focused late-night creative flow, agility, and premium underground craft. It feels decisive, direct, high-contrast, and modern.

### Visual Style
A blend of **Modern Dark Minimalism** and **High-Contrast Neo-Brutalism softened by contemporary curvature**. Rich tiered dark surfaces create physical dimension, anchored by glowing yellow focal points, generous card corners, and pill-shaped interactive anchors.

## Colors

The palette is engineered specifically for immersive low-light readability and selective visual hierarchy.

- **Primary Accent (`#FFE600`)**: Electric yellow used for decisive interactions, prominent badges, primary call-to-actions, active navigation highlights, and bounty value indicators.
- **Base Canvas (`#121212`)**: Deep pitch black, grounding the interface to maximize OLED efficiency and visual depth.
- **Surface Elevation (`#1C1C1E` / `#252528`)**: Subtle dark grey steps used for interactive containers, category tiles, and list cards.
- **Typography & Details**:
  - High-emphasis text: `#FFFFFF`
  - Muted secondary metadata & inactive icons: `#8E8E93` and `#9E9E9E`
  - Subtle structural outlines: `rgba(255, 255, 255, 0.08)`

## Typography

The type system blends the geometric punch of Plus Jakarta Sans for branding, titles, and headers with the rock-solid structural clarity of Inter for metadata, labels, and paragraph body.

- **Headlines**: Set in Plus Jakarta Sans with tighter tracking to deliver authority, punchiness, and energetic presence.
- **Body & Numerical Values**: Handled by Inter to ensure maximum legibility for rates, commission ranges, bid counts, and detailed client briefs.
- **Metadata**: Displayed in `body-sm` or `label-md` using slate neutral shades to keep feeds scannable without visual pollution.

## Layout & Spacing

Layouts follow an 8pt rhythmic grid tailored for mobile-first native interactions while expanding gracefully into tablet and desktop viewports.

### Rhythm & Grid
- **Mobile (< 768px)**: 4-column fluid layout with `1.25rem` screen edge margins. Horizontal card carousels (such as Service Requests and Category cards) break through right margins with peeking overflow indicators.
- **Desktop & Web (> 768px)**: 12-column grid system centered with fixed max-width (1200px) and `2rem` gutters.

### Component Gaps
- Tightly grouped metadata uses `space-xs` (4px) and `space-sm` (8px).
- Internal card padding defaults to `space-md` (16px).
- Section breaks and stacked vertical lists conform to `space-lg` (24px) or `space-xl` (32px).

## Elevation & Depth

This design system avoids heavy drop shadows in favor of tonal layering and delicate borders that preserve pure dark mode integrity.

### Tonal Hierarchy
1. **Canvas Level (0dp)**: `#121212` for root page backgrounds.
2. **Surface Level (1dp)**: `#1C1C1E` for primary interactive cards, input containers, and category tiles.
3. **Elevated Surface (2dp)**: `#252528` for floating action elements, modals, popovers, and sticky navigation bars.

### Outlines & Highlights
- Containers feature a hairline ghost stroke (`1px solid rgba(255, 255, 255, 0.07)`), clearly defining object silhouettes without adding visual clutter.
- Primary active focal points (like the floating yellow navigation bubble) project an electric ambient glow: `0 4px 16px rgba(255, 230, 0, 0.35)`.

## Shapes

The geometric signature is defined by soft rounded cards complemented by organic pill-shaped controls.

- **Base Radius (`rounded-md`, 8px)**: Utility controls, filter toggles, and status badges.
- **Card Containers (`rounded-xl`, 16px to 24px)**: Service gig cards, role selection tiles, and category bricks.
- **Full Pill (`rounded-full`, 9999px)**: Search bars, pill buttons, avatar frames, active tab indicators, and bottom navigation pill containers.

## Components

### Buttons
- **Primary**: Full `#FFE600` fill, pure `#121212` bold typography. Full rounded pill format (`rounded-full`) or soft card corner (`rounded-xl`).
- **Secondary / Ghost**: Pure `#1C1C1E` surface with a `1px` subtle outline (`rgba(255, 255, 255, 0.12)`) and white text.
- **Text Link**: Underlined crisp white or electric yellow link typography.

### Input Fields & Search Bars
- Pill-shaped container (`rounded-full`), `#1C1C1E` background, interior search icon in `#8E8E93`.
- Clear, light-grey placeholder text with an optional right-aligned filter icon.

### Cards & Service Requests
- Surfaces set to `#1C1C1E` with `16px` border radius and `1px solid rgba(255, 255, 255, 0.06)`.
- Features image header at top with rounded top corners, followed by bold bounty pricing ($) in white or yellow, concise title, and muted metadata pills below.

### Bottom Navigation Bar
- Fixed bottom dock with `#1C1C1E` surface and top blur backdrop filter.
- Inactive items rendered in `#8E8E93`.
- Active item enclosed in a vibrant circular disc of `#FFE600` with high-contrast `#121212` iconography.

### Chips & Filter Tags
- Compact pill elements (`rounded-full`) with `#252528` surface, `1px solid rgba(255, 255, 255, 0.08)`, and `12px` font size for category sorting.