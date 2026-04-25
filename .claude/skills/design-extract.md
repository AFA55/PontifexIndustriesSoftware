# Design Extract Skill
# Source: https://github.com/Manavarya09/design-extract
# Extracts complete design systems from any live website in one command.

## Usage
```
/extract-design <url>
```
Example: `/extract-design https://cenpoint.com`

## What it extracts
- Color palettes (hex/rgb/oklch)
- Typography (fonts, sizes, weights, line heights)
- Spacing scale
- Shadows and elevations
- Border radius tokens
- Motion/animation tokens
- Component anatomy stubs

## Output formats
DTCG tokens, Tailwind config, React theme, shadcn/ui theme, Figma variables,
CSS custom properties, W3C design tokens, AI-optimized markdown summary.

## Install (one-time, run in terminal)
```bash
npx skills add Manavarya09/design-extract
# or globally:
npm install -g designlang
```

## Best use for Pontifex platform
- Extract design language from competitor sites (CenPoint, DSM) for competitive analysis
- Extract from Patriot Concrete Cutting's current site for brand alignment
- Generate Tailwind token baseline before building new pages
