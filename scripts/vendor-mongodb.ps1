# Copies the MongoDB server binary that JOI bundles into vendor/mongodb, so a customer's
# PC needs no separate database install. The desktop app starts it privately on first
# launch (see electron/embeddedDb.cjs).
#
# Source: a local MongoDB Community install (default), or -DownloadVersion to fetch the
# official zip from fastdl.mongodb.org.
param(
    [string]$MongoBin = "C:\Program Files\MongoDB\Server\8.2\bin",
    [string]$DownloadVersion = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dest = Join-Path $root "vendor\mongodb"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

if ($DownloadVersion) {
    $zip = Join-Path $env:TEMP "mongodb-$DownloadVersion.zip"
    $url = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$DownloadVersion.zip"
    Write-Host "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $zip
    $extract = Join-Path $env:TEMP "mongodb-$DownloadVersion"
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $MongoBin = (Get-ChildItem $extract -Directory | Select-Object -First 1).FullName + "\bin"
}

$mongod = Join-Path $MongoBin "mongod.exe"
if (-not (Test-Path $mongod)) { throw "mongod.exe not found at $mongod" }
Copy-Item $mongod $dest -Force

# Licence and notices travel with the binary (MongoDB Community is SSPL).
$serverDir = Split-Path -Parent $MongoBin
foreach ($f in @("LICENSE-Community.txt", "THIRD-PARTY-NOTICES", "MPL-2", "README")) {
    $p = Join-Path $serverDir $f
    if (Test-Path $p) { Copy-Item $p $dest -Force }
}

# mongod links against the Visual C++ 2015-2022 runtime. Microsoft permits app-local
# copies of these files, so customers don't need the VC++ redistributable installed.
foreach ($dll in @("msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll")) {
    $p = Join-Path $env:SystemRoot "System32\$dll"
    if (-not (Test-Path $p)) { throw "$dll not found in System32; install the VC++ 2015-2022 x64 redistributable" }
    Copy-Item $p $dest -Force
}

& (Join-Path $dest "mongod.exe") --version | Select-Object -First 1
Write-Host "Vendored MongoDB into $dest" -ForegroundColor Green
