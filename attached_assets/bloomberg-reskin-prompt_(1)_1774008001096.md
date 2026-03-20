# Make the dashboard look like a Bloomberg Terminal

Restyle the entire frontend (`public/index.html`) to look like a Bloomberg Terminal. Do not change any of the data fetching logic, API endpoints, chart data, risk score calculations, signal card click-to-expand behavior, or the server.js backend. This is purely a visual reskin.

## The Bloomberg Terminal Aesthetic

Bloomberg terminals have a very specific, instantly recognizable look. Follow these rules precisely:

### Colors
- **Background:** Pure black `#000000`. Not dark grey, not near-black. Black.
- **Primary text/data color:** Amber/orange `#ff9933`. This is the signature Bloomberg color. All primary data values, prices, and the main headline text should be this color.
- **Secondary text:** Dimmer amber `#cc7a29` for labels, metadata.
- **Muted text:** Dark amber `#664422` for less important info, axis labels.
- **Neutral text:** Light grey `#dddddd` for secondary content that shouldn't be amber (e.g., descriptive subtitles).
- **Dim grey:** `#888888` for timestamps, footnotes.
- **Borders/dividers:** `#333333`. Thin 1px solid lines everywhere.
- **Up/positive:** Bright green `#33ff33` (terminal green, not modern green).
- **Down/negative:** Bright red `#ff3333`.
- **Warning/caution:** Yellow `#ffff33`.
- **Chart secondary colors:** Use `#ff3399` (magenta/pink), `#3399ff` (blue), `#33cccc` (cyan), `#9966ff` (purple) — all saturated, terminal-style.

### Typography
- **Font:** `Consolas, 'SF Mono', Monaco, Menlo, monospace`. No Google Fonts. No sans-serif anywhere. Everything is monospace.
- **Font smoothing:** Set `-webkit-font-smoothing: none` on the body. Bloomberg terminals don't have antialiased text — it's raw and pixelated.
- **All labels are UPPERCASE.** Every label, section header, metric name — uppercase with letter-spacing.
- **Font sizes:** Keep them small and dense. 9-11px for labels, 16-20px for values, 32px for the big gauge numbers. Bloomberg terminals are information-dense.

### Borders & Shapes
- **Zero border-radius. On everything.** No rounded corners anywhere in the entire application. Not on cards, not on buttons, not on pills, not on chart tooltips. Every rectangle is a sharp rectangle.
- **No box-shadows.** Bloomberg terminals are flat.
- **No gradients.** Solid colors only.
- **Grid gaps should be 1px** with the border color showing through — so adjacent cards are separated by a thin rule, not whitespace. This is the signature terminal look where the grid border-color acts as the divider.

### Section Headers
- Bloomberg uses inverted color bars for section labels: **amber background `#ff9933` with black text `#000000`**. Make section headers `display: inline-block` with this inverted color scheme. They should look like function key labels.

### Layout
- Dense. Tight padding (8-10px in cards, 4-6px gaps). Bloomberg terminals waste zero space.
- The top bar should be minimal: title on the left (styled as `RCSSN <GO>` with `<GO>` in green), status pill + timestamp + refresh button on the right.
- Add a thin fixed bottom bar (like Bloomberg's ticker) showing "FRED · FMP · 1H AUTO-REFRESH" on the left and "DATA MAY BE DELAYED · NOT INVESTMENT ADVICE" on the right in dim grey.

### Signal Cards
- Background: `#000000` (same as page, the 1px grid border separates them).
- On hover: very subtle background shift to `#0a0a0a` or `#111111`.
- Threat border accents (left border): keep the red/yellow/green system but at 2px width.
- The expand hint arrow should be `▸` (right-pointing triangle) not `▼`.

### Charts
- Chart grid lines: `#181818` (barely visible).
- Chart line weights: 1px (thin, terminal-style).
- Chart axis text: 7-8px monospace.
- The crosshair tooltip boxes should be **sharp rectangles** (no roundRect — use fillRect/strokeRect). Background `#000000ee`, border matching the dataset color.
- Legend items: 6px box width, 8px font.

### Status Pill
- No border-radius. Sharp rectangle.
- States: "WAIT" (yellow, blinking via CSS `step-end` animation), "LIVE" (green), "ERR" (red).

### Loading Screen
- Replace the spinner with a blinking cursor (a small amber rectangle that blinks via CSS). Below it, text: `RCSSN <GO> Loading...`

### Buttons
- Refresh button: sharp rectangle, 1px border `#333`, text in dim amber. On hover: border and text go full amber.

### Scrollbar
- 4px wide, track is black, thumb is `#333`.

## What NOT to change
- Any JavaScript logic (data fetching, rendering, risk calculations, drawer behavior, auto-refresh, cache flush)
- The server.js file
- The Chart.js crosshair tooltip plugin logic (just update its visual style: colors, use rect instead of roundRect, font family)
- The HTML structure (div IDs, class names used by JS for rendering). You can add classes but don't remove or rename existing ones that the JS references.
- Chart.js chart configurations (datasets, data sources, scales behavior). Only change their visual properties (colors, line widths, point styles, grid colors).

## Summary
The end result should look like someone ripped a page out of a Bloomberg Terminal and put it in a browser. Dense, monospace, amber-on-black, sharp edges, zero decoration. If it looks "designed" or "modern" you've gone too far. It should look like it was built by a quant in 1998 and never restyled.
