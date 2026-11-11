param(
    [string]$NsisCompiler,
    [string]$WebView2Bootstrapper,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version' }
$dist = Join-Path $root 'dist'
$cache = Join-Path $dist 'installer-tools'
$payload = Join-Path $dist ('payload-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $cache, $payload | Out-Null
if (-not $SkipBuild) { & (Join-Path $root 'host\build.ps1') }

if (-not $NsisCompiler) {
    $nsisArchive = Join-Path $cache 'nsis-3.11.zip'
    $NsisCompiler = Join-Path $cache 'nsis-3.11\makensis.exe'
    if (-not (Test-Path -LiteralPath $NsisCompiler)) {
        if (-not (Test-Path -LiteralPath $nsisArchive)) {
            & curl.exe -fsSL 'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.11/nsis-3.11.zip' -o $nsisArchive
        }
        if ((Get-FileHash -LiteralPath $nsisArchive -Algorithm SHA256).Hash -ne 'C7D27F780DDB6CFFB4730138CD1591E841F4B7EDB155856901CDF5F214394FA1') { throw 'NSIS archive checksum mismatch' }
        Expand-Archive -LiteralPath $nsisArchive -DestinationPath $cache -Force
    }
}
if (-not $WebView2Bootstrapper) {
    $WebView2Bootstrapper = Join-Path $cache 'MicrosoftEdgeWebview2Setup.exe'
    if (-not (Test-Path -LiteralPath $WebView2Bootstrapper)) {
        Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $WebView2Bootstrapper -UseBasicParsing
    }
}
$signature = Get-AuthenticodeSignature -LiteralPath $WebView2Bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') { throw 'WebView2 bootstrapper must have a valid Microsoft signature' }
if (-not (Test-Path -LiteralPath $NsisCompiler)) { throw 'NSIS compiler missing' }
$NsisCompiler = [IO.Path]::GetFullPath($NsisCompiler)
$WebView2Bootstrapper = [IO.Path]::GetFullPath($WebView2Bootstrapper)

# Fixed runtime/source allowlists exclude upstream trademark assets and build caches.
$sources = @('.gitattributes', '.gitignore', 'LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md',
    'host\DesktopGroupEditor.cs', 'host\GroupState.cs', 'host\IconIdentityTracker.cs', 'host\DesktopHost.cs', 'host\Themes.cs', 'host\ClassDesk.csproj', 'host\ClassDesk.ico', 'host\README.md', 'host\app.manifest', 'host\build.ps1', 'host\inspect.ps1',
    'tools\build-installer.ps1', 'tools\installer.nsi', 'tools\version.json', 'tools\generate-icon.py', 'prototype\serve.mjs')
foreach ($optional in @('AGENTS.md', '.interface-design\system.md', 'docs\QA.md', 'package.json', 'package-lock.json', 'tools\package-portable.py', 'tools\build-installer-linux.py', '.github\workflows\windows-build.yml')) {
    if (Test-Path -LiteralPath (Join-Path $root $optional)) { $sources += $optional }
}
$sources += Get-ChildItem -LiteralPath (Join-Path $root 'tests') -Filter '*.mjs' -File | ForEach-Object { 'tests\' + $_.Name }
$themeFiles = @('playground-crowd.mjs', 'school-scene-model.mjs', 'group-labels.mjs', 'legacy-labels.mjs', 'legacy-groups.mjs', 'flat.html', 'meadow.html', 'beach-palms.js', 'meadow-boy.js', 'meadow-cat.js', 'share.js', 'chalkboard.html', 'playground.html', 'gym.html', 'classroom.html', 'settings.html', 'themes.json',
    'school-layout.mjs', 'school-state.mjs', 'school-renderer.mjs', 'school-app.mjs', 'school-wallpaper.mjs', 'school-ui.css', 'assets\classdesk.svg',
    'i18n\ko.json', 'i18n\en.json', 'i18n\zh-CN.json')
$fontRoot = Join-Path $root 'prototype\assets\fonts'
if (Test-Path -LiteralPath $fontRoot) {
    $themeFiles += Get-ChildItem -LiteralPath $fontRoot -Recurse -File | ForEach-Object {
        $_.FullName.Substring((Join-Path $root 'prototype').Length + 1)
    }
}
$themes = (Get-Content -LiteralPath (Join-Path $root 'prototype\themes.json') -Raw -Encoding UTF8 | ConvertFrom-Json).themes
$ready = @($themes | Where-Object { $_.status -eq 'ready' })
if ($themes.Count -ne 6 -or $ready.Count -ne 6 -or (($ready.id | Sort-Object) -join ',' -ne 'beach,chalkboard,classroom,gym,meadow,playground')) {
    throw 'Expected the two existing themes plus four usable school themes'
}
foreach ($theme in $ready) {
    $expectedPage = if ($theme.id -eq 'beach') { 'flat.html' } else { $theme.id + '.html' }
    if ($theme.product -ne 'free' -or $theme.locked -eq $true -or $theme.page -ne $expectedPage) {
        throw 'All six themes must be free and map to their real HTML entry'
    }
}
$sources += $themeFiles | ForEach-Object { 'prototype\' + $_ }
$sourceStage = Join-Path $payload 'source-stage'
foreach ($file in $sources) {
    $target = Join-Path $sourceStage $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $target
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceZipPayload = Join-Path $payload 'ClassDesk-source.zip'
$sourceZipDist = Join-Path $dist "ClassDesk-$version-source.zip"
[IO.Compression.ZipFile]::CreateFromDirectory($sourceStage, $sourceZipPayload)
Copy-Item -LiteralPath $sourceZipPayload -Destination $sourceZipDist -Force
# Only program data is installed. The accompanying ZIP contains the exact corresponding source.
$runtimeFiles = @('host\bin\ClassDesk.exe', 'host\bin\ClassDesk.ico', 'host\bin\Microsoft.Web.WebView2.Core.dll', 'host\bin\Microsoft.Web.WebView2.WinForms.dll', 'host\bin\WebView2Loader.dll')
foreach ($optional in @('host\bin\ClassDesk.exe.config', 'host\bin\WebView2-LICENSE.txt')) {
    if (Test-Path -LiteralPath (Join-Path $root $optional)) { $runtimeFiles += $optional }
}
$docFiles = @('LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md')
if (Test-Path -LiteralPath (Join-Path $root 'docs\QA.md')) { $docFiles += 'docs\QA.md' }
$installFiles = $docFiles + @($themeFiles | Where-Object { $_ -ne 'serve.mjs' } | ForEach-Object { 'prototype\' + $_ }) + $runtimeFiles
foreach ($file in $installFiles) {
    $target = Join-Path $payload $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $target
}
$installFiles += 'ClassDesk-source.zip'
$portableRoot = Join-Path $payload "portable\ClassDesk-$version"
foreach ($file in $installFiles) {
    $target = Join-Path $portableRoot $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $payload $file) -Destination $target
}
[IO.File]::WriteAllText((Join-Path $portableRoot 'Start ClassDesk.cmd'), "@echo off`r`nstart `"`" `"%~dp0host\bin\ClassDesk.exe`"`r`n", (New-Object Text.UTF8Encoding($false)))
$portableZipDist = Join-Path $dist "ClassDesk-$version-windows-x64.zip"
if (Test-Path -LiteralPath $portableZipDist) { Remove-Item -LiteralPath $portableZipDist -Force }
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $payload 'portable'), $portableZipDist)
$utf8 = New-Object Text.UTF8Encoding($true)
$utf8NoBom = New-Object Text.UTF8Encoding($false)
$fileLines = @()
$deleteLines = @()
$directories = @{}
foreach ($file in $installFiles) {
    if ($file -match '["$\r\n]') { throw 'Unsafe package path' }
    $dir = Split-Path $file
    $fileLines += 'SetOutPath "$INSTDIR' + $(if ($dir) { '\' + $dir } else { '' }) + '"'
    $fileLines += 'File "' + (Join-Path $payload $file) + '"'
    $deleteLines += 'Delete "$INSTDIR\' + $file + '"'
    while ($dir) { $directories[$dir] = $true; $dir = Split-Path $dir }
}
$deleteLines += $directories.Keys | Sort-Object Length -Descending | ForEach-Object { 'RMDir "$INSTDIR\' + $_ + '"' }
$fileList = Join-Path $payload 'files.nsh'
$deleteList = Join-Path $payload 'delete.nsh'
[IO.File]::WriteAllLines($fileList, [string[]]$fileLines, $utf8)
[IO.File]::WriteAllLines($deleteList, [string[]]$deleteLines, $utf8)
$output = Join-Path $dist "ClassDesk-$version-win-x64-Setup.exe"
& $NsisCompiler /V2 "/DVERSION=$version" "/DPAYLOAD=$payload" "/DOUTPUT=$output" "/DBOOTSTRAPPER=$WebView2Bootstrapper" "/DFILE_LIST=$fileList" "/DDELETE_LIST=$deleteList" (Join-Path $PSScriptRoot 'installer.nsi')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
$bootstrapperHash = (Get-FileHash -LiteralPath $WebView2Bootstrapper -Algorithm SHA256).Hash.ToLowerInvariant()
$outputSize = (Get-Item -LiteralPath $output).Length
[IO.File]::WriteAllText(($output + '.sha256'), "$hash  $([IO.Path]::GetFileName($output))`n", $utf8NoBom)
$manifestFiles = @($installFiles | Sort-Object | ForEach-Object { @{ path = $_.Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath (Join-Path $payload $_) -Algorithm SHA256).Hash.ToLowerInvariant() } })
$manifest = [ordered]@{
    installer = [IO.Path]::GetFileName($output)
    sha256 = $hash
    bytes = $outputSize
    installer_signed = $false
    signature = [ordered]@{
        publisher = 'Microsoft Corporation'
        status = 'verified'
        scope = 'embedded WebView2 bootstrapper, primary signature, current build time'
        bootstrapper_sha256 = $bootstrapperHash
    }
    files = $manifestFiles
}
[IO.File]::WriteAllText(($output + '.manifest.json'), ($manifest | ConvertTo-Json -Depth 5), $utf8NoBom)
$sums = @(
    "$hash  $([IO.Path]::GetFileName($output))",
    "$((Get-FileHash -LiteralPath $portableZipDist -Algorithm SHA256).Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($portableZipDist))",
    "$((Get-FileHash -LiteralPath $sourceZipDist -Algorithm SHA256).Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($sourceZipDist))"
) -join "`n"
[IO.File]::WriteAllText((Join-Path $dist "ClassDesk-$version-SHA256SUMS.txt"), ($sums + "`n"), $utf8NoBom)
Remove-Item -LiteralPath $payload -Recurse -Force
Write-Host "Installer: $output"
Write-Host "Portable ZIP: $portableZipDist"
Write-Host "Source ZIP: $sourceZipDist"
Write-Host "SHA256: $hash"
