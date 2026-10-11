param([Parameter(Mandatory = $true)][string]$UserDataMarker)

# Stops the instance launched with a throwaway --user-data-dir that contains the
# marker: the Electron tree and the npm / electron-vite processes that started
# it. A plain substring match, so wildcard characters in the marker are literal.
# Never touches any other instance.
$names = @('electron.exe', 'node.exe')
$mine = Get-CimInstance Win32_Process |
  Where-Object { $names -contains $_.Name -and $_.CommandLine -and $_.CommandLine.Contains($UserDataMarker) }
$roots = $mine | Where-Object { -not $_.CommandLine.Contains('--type=') }
foreach ($p in $roots) { taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null }
Start-Sleep -Seconds 2
$left = @(Get-CimInstance Win32_Process |
  Where-Object { $names -contains $_.Name -and $_.CommandLine -and $_.CommandLine.Contains($UserDataMarker) }).Count
"left=$left"
