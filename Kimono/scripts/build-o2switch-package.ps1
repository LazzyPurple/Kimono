Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir 'o2switch-path-utils.ps1')

$projectRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$deployDir = Join-Path $projectRoot 'deploy'
$artifactName = 'kimono-o2switch-linux-prebuilt.zip'
$artifactPath = Join-Path $deployDir $artifactName
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("kimono-o2switch-stage-" + [guid]::NewGuid().ToString('N'))

function Convert-ToWslPath {
  param([Parameter(Mandatory = $true)][string] $Path)

  return Convert-WindowsPathToWslPath -Path $Path
}

try {
  $installedDistros = (& wsl.exe -l -q 2>$null | Where-Object { $_.Trim() -ne '' })
  if ($LASTEXITCODE -ne 0 -or -not $installedDistros) {
    throw "WSL is not installed. Install Ubuntu first with 'wsl --install -d Ubuntu', then rerun this script."
  }

  New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
  New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

  $linuxProjectRoot = Convert-ToWslPath -Path $projectRoot
  $linuxScriptPath = Convert-ToWslPath -Path (Join-Path $projectRoot 'scripts/build-o2switch-package.sh')
  $linuxStagingDir = Convert-ToWslPath -Path $stagingDir

  Write-Host "[o2switch] Building Linux artifact from WSL..."
  & wsl.exe bash -lc "'$linuxScriptPath' '$linuxProjectRoot' '$linuxStagingDir'"
  if ($LASTEXITCODE -ne 0) {
    throw "The WSL packaging script failed."
  }

  if (-not (Test-Path (Join-Path $stagingDir 'server.js'))) {
    throw "The staged package is missing server.js."
  }

  if (-not (Test-Path (Join-Path $stagingDir '.next\BUILD_ID'))) {
    throw "The staged package is missing .next/BUILD_ID."
  }

  if (Test-Path $artifactPath) {
    Remove-Item -Force $artifactPath
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $artifactPath)

  $zip = [System.IO.Compression.ZipFile]::OpenRead($artifactPath)
  try {
    $normalizedEntries = $zip.Entries.FullName | ForEach-Object { $_ -replace '\\', '/' }
    if ($normalizedEntries -notcontains 'server.js') {
      throw "The generated zip is missing server.js."
    }
    if ($normalizedEntries -notcontains 'package.json') {
      throw "The generated zip is missing package.json."
    }
    if ($normalizedEntries -notcontains '.next/BUILD_ID') {
      throw "The generated zip is missing .next/BUILD_ID."
    }
  }
  finally {
    $zip.Dispose()
  }

  Write-Host "[o2switch] Artifact created: $artifactPath"
}
finally {
  if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
  }
}
