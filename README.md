# SKYPASS Mile Calculator

## GitHub Pages

This is a static site and does not require a build step or server-side runtime.

1. Push this repository to GitHub.
2. Open **Settings > Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/(root)`, then save.

GitHub Pages will publish the site at `https://yoshikis329.github.io/skypass-mile-calculator/`.

## Project structure

```text
.
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/script.js
├── data/mileage-rates.json
└── README.md
```

All local assets use relative paths, so the app works from a project-site subpath. Airport coordinates are fetched from OpenFlights at runtime, so users need an internet connection.

Mileage rates are maintained in `data/mileage-rates.json` and reference the [Korean Air SkyTeam earning guide](https://www.koreanair.com/contents/skypass/earn-miles/partner-airlines/skyteam).
