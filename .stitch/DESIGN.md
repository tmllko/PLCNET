# CyberIndustrial V3 — PLC Network Monitor Design System

## 1. Design Identity
- **Application**: PLC Network Monitor v3 — Tata Motors  
- **Creative Theme**: "The Digital Forge" — Industrial Kineticism  
- **Vibe**: Dark, High-tech, Mission-critical SCADA  
- **Design System**: CyberIndustrial V3 (Stitch asset `f6b5d95a6bba47d38ebb0dbd17a25e60`)

## 2. Color Palette

| Role | Token | Hex |
|------|-------|-----|
| Primary Accent | `primary` | `#44d8f1` |
| Primary Container | `primary_container` | `#00bcd4` |
| Background (base) | `background` / `surface` | `#0e1323` |
| Panel Low | `surface_container_low` | `#161b2b` |
| Panel | `surface_container` | `#1a1f2f` |
| Panel High | `surface_container_high` | `#24293a` |
| Panel Bright | `surface_bright` | `#34394a` |
| Text Primary | `on_surface` | `#dee1f8` |
| Text Muted | `on_surface_variant` | `#bbc9cc` |
| Fault/Error | `error_container` | `#93000a` |
| Error Glow | `error` | `#ffb4ab` |
| Warning | `tertiary_container` | `#f19640` |
| Warning Text | `tertiary` | `#ffb87b` |

## 3. Typography
- **Labels/Navigation/Buttons**: Space Grotesk Bold, ALL CAPS, `letter-spacing: 3px`  
- **Data/Values/Timestamps**: Share Tech Mono (monospace, tabular figures)

## 4. Design Rules
1. **No opaque borders** — use background color shifts and `outline-variant` at 15% max opacity
2. **Glassmorphism panels** — `backdrop-blur: 12px`, cyan ghost border at 30% opacity
3. **Luminous glow** for status: OK = cyan glow, Fault = red outer glow (20px blur)
4. **All numbers** must use Share Tech Mono  
5. **Corner radius**: 4px (`ROUND_FOUR`) — no pill shapes  
6. **Never use** `#FFFFFF` — use `on_surface` (#dee1f8) as brightest color

## 5. Component Patterns
- **Status badges**: Colored pill with matching background opacity + glow
- **PLC cards**: Glassmorphism panel, color-coded left border (4px) per status
- **Buttons Primary**: `primary_container` fill, Rajdhani Bold ALL CAPS
- **Buttons Secondary**: Ghost (outline at 40% opacity)
- **Tables**: Dark `surface_container_lowest` rows, alternating with `surface_container_low`

## 6. Design System Notes for Stitch Generation
```
DESIGN SYSTEM (REQUIRED):
- Platform: Web, Desktop-first, 1920-2560px wide
- Palette: Cyan primary (#44d8f1 / #00bcd4), Background (#0e1323), Panels (#1a1f2f / #24293a)
  OK green (#00e676), Fault red (#93000a with #ffb4ab glow), Warning amber (#f19640)
  Text (#dee1f8), Muted (#bbc9cc)
- Typography: Space Grotesk Bold for UI labels (ALL CAPS, letter-spacing 3px),
  Share Tech Mono for data values and timestamps
- Styles: 4px corner radius, glassmorphism panels with cyan ghost borders,
  neon ambient glow for status elements, no opaque dividers
- Theme token: CyberIndustrial V3 | Stitch design system: assets/f6b5d95a6bba47d38ebb0dbd17a25e60
```
