# UI Accessibility and Visual Review Checklist

## Keyboard and Focus Audit
- Confirmed all chips, section toggles, and the theme switcher show a 3px focus halo using the shared focus ring color.
- Scenario preset buttons correctly toggle `aria-pressed` and announce updates via the shared status region.
- Quick sliders expose their live values through `role="status"` outputs and each slider references the display with `aria-describedby` for screen reader context.
- Theme lock and toggle controls react to locale changes while keeping keyboard operation intact.

## Contrast Review
- Chip states now use the active surface tokens for a minimum 4.5:1 contrast in both light and dark themes.
- Theme lock text inherits the primary foreground color to clear AA contrast requirements against the card background.
- Hover and focus styling on the theme toggle escalates text color to the accent strong token so the state change remains visible in either theme.

## Responsive Breakpoint Review

### 360px viewport
- Hero actions and scenario presets wrap cleanly with no clipped focus outlines.
- Sliders retain label proximity and the live outputs remain directly below each control for quick scanning.

### 768px viewport
- Theme controls stay grouped to the right edge without overlap, and preset chips occupy two compact rows when needed.
- Calculator sections stack with consistent spacing and tooltips remain within the viewport bounds.

### 1280px viewport
- Preset chips, sliders, and service cards maintain their grid spacing while the focus halo remains fully visible.
- Theme toggle spacing and button group alignment stay balanced within the wider hero layout.
