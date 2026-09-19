# Third-party software and fonts

Paper Pal itself is released under the [MIT License](LICENSE). It uses the
following third-party components. Each stays under its own licence.

## KaTeX

- Use: renders math in the page. It is the only runtime dependency, installed
  by `npm install` into `node_modules/katex` (version range `^0.18.1` in
  `package.json`) and served from there under `/vendor/katex/`. It is not
  copied into this repository.
- Licence: MIT. Copyright (c) 2013-2020 Khan Academy and other contributors.
  Full text: `node_modules/katex/LICENSE`.
- The KaTeX distribution includes the KaTeX fonts
  (`node_modules/katex/dist/fonts`). The KaTeX project publishes them under the
  SIL Open Font License 1.1 (https://github.com/KaTeX/katex-fonts).
- Source: https://github.com/KaTeX/KaTeX

## Fonts vendored in `public/fonts/`

Both families are variable fonts in WOFF2 format, subset to the Latin and
Latin Extended ranges, and served locally so that the page makes no request to
a font CDN.

### Inter

- Files: `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`
- Use: interface text.
- Licence: SIL Open Font License, Version 1.1. Copyright 2016 The Inter
  Project Authors (https://github.com/rsms/inter). Full text:
  [public/fonts/LICENSE-Inter.txt](public/fonts/LICENSE-Inter.txt).

### Source Serif 4

- Files: `source-serif-4-latin-wght-normal.woff2`,
  `source-serif-4-latin-ext-wght-normal.woff2`,
  `source-serif-4-latin-wght-italic.woff2`,
  `source-serif-4-latin-ext-wght-italic.woff2`
- Use: manuscript text.
- Licence: SIL Open Font License, Version 1.1. Source Serif is developed by
  Adobe (https://github.com/adobe-fonts/source-serif); "Source" is a Reserved
  Font Name of Adobe. Full licence text as shipped with the font files:
  [public/fonts/LICENSE-SourceSerif4.txt](public/fonts/LICENSE-SourceSerif4.txt).

The OFL allows bundling and redistribution with software, provided the fonts
are not sold by themselves and the licence text travels with them. Paper Pal
does not modify the font files.

## Development and test tooling

The test suite uses only Node.js built-ins (`node:test`, `node:assert`).
`npm run screenshots` needs Playwright (Apache-2.0), which is installed by hand
for that run and is neither a dependency nor redistributed.
