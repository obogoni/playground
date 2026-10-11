param([Parameter(Mandatory = $true)][string]$UserDataMarker)

# Stops the Electron instance launched with a throwaway --user-data-dir that
# contains the marker, and its children. Never touches any other instance.
$roots = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -like "*$UserDataMarker*" -and $_.CommandLine -notlike '*--type=*' }
foreach ($p in $roots) { taskkill /PID $p.ProcessId /T /F | Out-Null }
Start-Sleep -Seconds 2
$left = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -like "*$UserDataMarker*" }).Count
"left=$left"
