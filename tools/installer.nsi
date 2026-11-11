Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"
${UnStrStr}
Name "교실데스크 · ClassDesk"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\ClassDesk"
InstallDirRegKey HKCU "Software\ClassDesk\Installer" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "교실데스크 · ClassDesk"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "ClassDesk"
VIAddVersionKey /LANG=1033 "FileDescription" "ClassDesk Korean School Wallpaper Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright 2026 Deskland authors and ClassDesk contributors; GPL-3.0"
!define MUI_ABORTWARNING
!define MUI_ICON "${PAYLOAD}\host\bin\ClassDesk.ico"
!define MUI_UNICON "${PAYLOAD}\host\bin\ClassDesk.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\host\bin\ClassDesk.exe"
!define MUI_FINISHPAGE_RUN_TEXT "$(LaunchClassDesk)"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PAYLOAD}\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"
LangString LaunchClassDesk ${LANG_KOREAN} "교실데스크 실행"
LangString LaunchClassDesk ${LANG_ENGLISH} "Launch ClassDesk"
LangString AppFiles ${LANG_KOREAN} "교실데스크 (기존 테마 2종 + 학교 테마 4종)"
LangString AppFiles ${LANG_ENGLISH} "ClassDesk (Beach, Meadow and four school themes)"
LangString NeedX64 ${LANG_KOREAN} "64비트 Windows 10 이상이 필요합니다."
LangString NeedX64 ${LANG_ENGLISH} "64-bit Windows 10 or later is required."
LangString NeedFramework ${LANG_KOREAN} "Microsoft .NET Framework 4.8 이상이 필요합니다. Microsoft 공식 설치 프로그램 또는 학교 전산 담당자를 통해 설치한 뒤 다시 실행해 주세요."
LangString NeedFramework ${LANG_ENGLISH} "Microsoft .NET Framework 4.8 or later is required. Install it using Microsoft's official installer or contact your IT administrator, then retry."
LangString CleanupFailed ${LANG_KOREAN} "교실데스크의 자동 시작 항목을 정리하지 못했습니다. 파일을 삭제하지 않았어요. 권한을 확인한 뒤 다시 시도해 주세요."
LangString CleanupFailed ${LANG_ENGLISH} "ClassDesk startup cleanup failed. Program files have not been removed. Check permissions and retry."
LangString CloseFailed ${LANG_KOREAN} "실행 중인 교실데스크를 종료한 뒤 다시 시도해 주세요."
LangString CloseFailed ${LANG_ENGLISH} "Please exit ClassDesk and retry."
LangString RuntimeFailed ${LANG_KOREAN} "WebView2 설치를 완료하지 못했습니다. 인터넷에 연결하여 Microsoft Edge WebView2 Runtime을 설치한 뒤 다시 시도해 주세요."
LangString RuntimeFailed ${LANG_ENGLISH} "WebView2 setup did not complete. Connect to the internet, install Microsoft Edge WebView2 Runtime, and retry."
LangString InstallingRuntime ${LANG_KOREAN} "Microsoft Edge WebView2 Runtime 설치 중 (인터넷 연결 필요)…"
LangString InstallingRuntime ${LANG_ENGLISH} "Installing Microsoft Edge WebView2 Runtime (internet required)..."

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "$(NeedX64)"
    SetErrorLevel 1
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "$(NeedX64)"
    SetErrorLevel 1
    Abort
  ${EndIf}
  SetShellVarContext current
  SetRegView 64
  !insertmacro MUI_LANGDLL_DISPLAY
  ClearErrors
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} ${Errors}
  ${OrIf} $0 < 528040
    MessageBox MB_ICONSTOP "$(NeedFramework)"
    SetErrorLevel 4
    Abort
  ${EndIf}
FunctionEnd

Function CheckRuntime
  StrCpy $0 ""
  SetRegView 32
  ReadRegStr $0 HKLM "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  SetRegView 64
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
FunctionEnd

Section "$(AppFiles)" SecApp
  SectionIn RO
  Call CheckRuntime
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=MicrosoftEdgeWebview2Setup.exe "${BOOTSTRAPPER}"
    DetailPrint "$(InstallingRuntime)"
    ExecWait '"$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1
    Call CheckRuntime
    ${If} $0 == ""
    ${OrIf} $0 == "0.0.0.0"
      MessageBox MB_ICONSTOP "$(RuntimeFailed)"
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${EndIf}
  IfFileExists "$INSTDIR\host\bin\ClassDesk.exe" 0 closed
  ExecWait '"$INSTDIR\host\bin\ClassDesk.exe" --exit-installed' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "$(CloseFailed)"
    SetErrorLevel 3
    Abort
  ${EndIf}
  closed:
  !include "${FILE_LIST}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\ClassDesk"
  CreateShortcut "$SMPROGRAMS\ClassDesk\교실데스크.lnk" "$INSTDIR\host\bin\ClassDesk.exe"
  CreateShortcut "$SMPROGRAMS\ClassDesk\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\ClassDesk\Installer" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "DisplayName" "교실데스크 · ClassDesk"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "Publisher" "ClassDesk contributors"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "DisplayIcon" "$INSTDIR\host\bin\ClassDesk.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk" "EstimatedSize" $0
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
FunctionEnd
Section "Uninstall"
  IfFileExists "$INSTDIR\host\bin\ClassDesk.exe" 0 unclosed
  ExecWait '"$INSTDIR\host\bin\ClassDesk.exe" --exit-installed' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "$(CloseFailed)"
    SetErrorLevel 3
    Abort
  ${EndIf}
  ExecWait '"$INSTDIR\host\bin\ClassDesk.exe" --uninstall-cleanup' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "$(CleanupFailed)"
    SetErrorLevel 5
    Abort
  ${EndIf}
  unclosed:
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClassDesk"
  ${UnStrStr} $1 $0 '$\"$INSTDIR\host\bin\ClassDesk.exe$\"'
  ${If} $1 != ""
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClassDesk"
  ${EndIf}
  !include "${DELETE_LIST}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\ClassDesk\교실데스크.lnk"
  Delete "$SMPROGRAMS\ClassDesk\Uninstall.lnk"
  RMDir "$SMPROGRAMS\ClassDesk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClassDesk"
  DeleteRegKey HKCU "Software\ClassDesk\Installer"
SectionEnd
