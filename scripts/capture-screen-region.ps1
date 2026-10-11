param(
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [Parameter(Mandatory = $true)][int]$Width,
  [Parameter(Mandatory = $true)][int]$Height,
  [int]$Count = 120,
  [int]$IntervalMs = 1000,
  [Parameter(Mandatory = $true)][string]$OutDir
)

# Captures a screen region as presented, in physical pixels, Count times.
# Run with pwsh (PowerShell 7): SetHighDpiMode makes the process per-monitor
# DPI aware, so the capture is not the scaled-down copy an unaware process gets.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[void][System.Windows.Forms.Application]::SetHighDpiMode([System.Windows.Forms.HighDpiMode]::PerMonitorV2)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$bmp = New-Object System.Drawing.Bitmap $Width, $Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
  for ($i = 0; $i -lt $Count; $i++) {
    $g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ('frame-{0:D4}.bmp' -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp.Save((Join-Path $OutDir ('frame-{0:D4}.png' -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    Start-Sleep -Milliseconds $IntervalMs
  }
} finally {
  $g.Dispose()
  $bmp.Dispose()
}
"captured=$Count"
