# DirectX Shader Cache Cleanup Script
# Save as: Clear-DXShaderCache.ps1

$cachePaths = @(
    "$env:LOCALAPPDATA\D3DSCache",
    "$env:SystemRoot\System32\config\systemprofile\AppData\Local\D3DSCache",
    "$env:SystemRoot\SysWOW64\config\systemprofile\AppData\Local\D3DSCache"
)

foreach ($path in $cachePaths) {
    if (Test-Path $path) {
        try {
            Write-Host "Deleting contents of: $path"
            Remove-Item "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Deleted: $path"
        } catch {
            Write-Warning "Failed to delete: $path. Error: $_"
        }
    } else {
        Write-Host "Path not found: $path"
    }
}

# Optional: Trigger Windows cleanup silently (if sageset was configured before)
Start-Process cleanmgr -ArgumentList "/sagerun:1" -NoNewWindow -Wait

Write-Host "DirectX Shader Cache cleanup completed."
