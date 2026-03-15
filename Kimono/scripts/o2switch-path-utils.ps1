Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-WindowsPathToWslPath {
  param([Parameter(Mandatory = $true)][string] $Path)

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $match = [regex]::Match($resolvedPath, '^([A-Za-z]):\\(.*)$')
  if (-not $match.Success) {
    throw "Unable to convert path to WSL format: $resolvedPath"
  }

  $drive = $match.Groups[1].Value.ToLowerInvariant()
  $suffix = $match.Groups[2].Value -replace '\\', '/'

  return "/mnt/$drive/$suffix"
}
