# Greenlight brand assets

## Files

| File | Use |
| --- | --- |
| `tokens.css` | The colour theme. Import once in the root layout, before anything else. Both themes are defined at token level, so no component ever hardcodes a colour. |
| `logo-mark.svg` | The tally lamp on its own. Nav, app rail, anywhere under 120px wide. |
| `logo-lockup-light.svg` | Mark plus wordmark, for light grounds. |
| `logo-lockup-dark.svg` | Mark plus wordmark, for dark grounds. |
| `../app/icon.svg` | Favicon. Simplified: no lens ticks, no faint ring, bigger core, so it still reads at 16px. |
| `../app/apple-icon.tsx` | 180px touch icon, generated at build. |
| `../app/opengraph-image.tsx` | 1200x630 link preview, generated at build. |
| `../app/metadata.ts` | Title, description, Open Graph, Twitter card, theme colour. Spread into the root layout. |

## The mark

A broadcast tally lamp. Ink housing, green core, a faint ring for the lens, and two ticks
at the sides that read as timecode marks at large sizes and disappear at small ones.
It is a status light rather than a logo, which is the point: the product exists to turn
one on.

Clear space: half the housing width on every side. Minimum size: 20px for the mark,
128px wide for the lockup. Below that use the favicon artwork instead.

Never: recolour the core to amber or red, put the mark on an amber or red ground,
add a gradient, rotate it, or set the wordmark in anything other than the serif stack.

## Colour rule

Green, amber and red mean exactly one thing each in this product.

- green, cleared
- amber, limited ads
- red, strike risk

They appear on verdicts, stamps and timeline bands only. Nothing decorative is allowed
to wear a signal colour, which is why the chrome is ink and paper and the accent green
is reserved for the mark and the cleared state. If a signal colour shows up on a button
or a heading, the report stops being readable at a glance.

## Type

Two roles. An old-style serif for anything a person reads, because the output is a
document that may end up in front of a platform review team. A monospace for anything a
machine produced: timecodes, filenames, policy IDs, labels. If a number lines up in a
column it is mono, if it is an argument it is serif.

Both are system stacks. No webfont request, so nothing silently swaps to a fallback on a
judge's machine mid demo.

## Note on the wordmark SVGs

The lockups set the wordmark as live `<text>` with the serif stack, so it renders with
whatever the machine has. That is fine for the web app, which uses the same stack. If the
lockup ever needs to go into a video thumbnail or a print asset, convert the text to
outlines first.

## Before launch

`SITE_URL` in `app/metadata.ts` is set to `greenlight.onenept.com` as a placeholder.
Point it at the real deployment before the first push, or the Open Graph tags will
advertise a domain that does not resolve.
