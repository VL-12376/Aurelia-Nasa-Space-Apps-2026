param(
  [Parameter(Mandatory = $true)][string]$Piper,
  [Parameter(Mandatory = $true)][string]$Models
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$lines = Get-Content -LiteralPath (Join-Path $root 'src\audio\crewLines.json') -Raw | ConvertFrom-Json
$voices = @{ aerospace = 'ljspeech'; controller = 'kristin'; propulsion = 'john'; science = 'bryce' }
$output = Join-Path $root 'public\crew-audio'
New-Item -ItemType Directory -Force -Path $output | Out-Null
foreach ($role in @('aerospace', 'propulsion', 'controller', 'science')) {
  $model = Join-Path $Models "en_US-$($voices[$role])-medium.onnx"
  if (-not (Test-Path -LiteralPath $model)) { throw "Missing model: $model" }
  $inputs = $lines | Where-Object { $_.role -eq $role } | ForEach-Object {
    @{ text = $_.text; output_file = (Join-Path $output "$role-$($_.id).wav") } | ConvertTo-Json -Compress
  }
  $inputs | & $Piper --model $model --json-input --length_scale 1.05 --sentence_silence 0.15
  if ($LASTEXITCODE -ne 0) { throw "Speech generation failed for $role" }
}
foreach ($line in $lines) {
  $file = Join-Path $output "$($line.role)-$($line.id).wav"
  if (-not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -le 44) {
    throw "Missing or empty speech: $file"
  }
}
Write-Output "Generated $($lines.Count) original crew lines."
