# Arbeitsstunden PWA

Lokale Arbeitszeiterfassung als installierbare Progressive Web App.

## Build erstellen

```powershell
.\build.ps1
```

Der fertige Produktionsstand liegt danach im Ordner:

```text
dist/
```

Fur GitHub Pages wird zusatzlich dieser Ordner erzeugt:

```text
docs/
```

`dist/` kann auf Cloudflare Pages, Netlify, Vercel oder einen Webserver hochgeladen werden. `docs/` ist fur die klassische GitHub-Pages-Einstellung `main / docs` gedacht.

## GitHub Pages

1. In GitHub `Settings > Pages` offnen.
2. Bei `Build and deployment` die Quelle `Deploy from a branch` wahlen.
3. Branch `main` und Ordner `/docs` wahlen.
4. Speichern.

## Android-Installation

1. Die gehostete App in Chrome auf dem Android-Tablet öffnen.
2. Chrome-Menü öffnen.
3. `App installieren` oder `Zum Startbildschirm hinzufügen` wählen.
4. Danach startet die App wie eine normale Tablet-App.

Nach dem ersten Öffnen funktioniert die App offline. Die Arbeitsstunden werden lokal auf dem Tablet gespeichert.

## Datensicherung

- `Daten exportieren` erstellt eine CSV-Datei.
- `Backup speichern` erstellt eine JSON-Sicherung aller lokalen Daten.
- `Backup laden` stellt diese JSON-Sicherung auf einem anderen Gerät wieder her.
