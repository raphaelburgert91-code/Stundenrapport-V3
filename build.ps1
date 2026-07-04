$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$docs = Join-Path $root "docs"

foreach ($target in @($dist, $docs)) {
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }

  New-Item -ItemType Directory -Path $target | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $target "icons") | Out-Null
}

$files = @(
  "index.html",
  "styles.css",
  "app.js",
  "service-worker.js",
  "manifest.json",
  "icon.svg"
)

foreach ($target in @($dist, $docs)) {
  foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $target $file)
  }

  Copy-Item -LiteralPath (Join-Path $root "icons\icon-192.png") -Destination (Join-Path $target "icons\icon-192.png")
  Copy-Item -LiteralPath (Join-Path $root "icons\icon-512.png") -Destination (Join-Path $target "icons\icon-512.png")
  New-Item -ItemType File -Path (Join-Path $target ".nojekyll") -Force | Out-Null
}

Write-Host "Build fertig: $dist"
Write-Host "GitHub-Pages-Ordner fertig: $docs"
