# 교실데스크 / ClassDesk Windows 호스트

교실데스크는 Deskland에서 파생한 **독립적인 GPL-3.0 프로젝트**입니다. 원저작권은 Deskland authors에게 있으며 변경 부분은 ClassDesk contributors가 제공합니다. 공식 Deskland 배포판이나 제휴 제품이 아닙니다. 원래 라이선스와 출처는 저장소의 `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `TRADEMARKS.md`를 함께 보존합니다. 실행 제품은 자체 이름과 직접 그린 책·칠판 아이콘만 사용합니다 (`tools/generate-icon.py`, Pillow).

## 빌드

64비트 Windows의 기본 .NET Framework C# 5 컴파일러:

```powershell
powershell -ExecutionPolicy Bypass -File host\build.ps1
host\bin\ClassDesk.exe
```

.NET SDK 8 이상이 설치된 Windows, Linux, macOS의 교차 컴파일:

```sh
dotnet build host/ClassDesk.csproj --configuration Release
node --test tests/host-school.test.mjs
```

두 경로 모두 NuGet의 WebView2 SDK **1.0.4191.47**을 사용합니다. SDK 프로젝트는 Microsoft의 .NET Framework 4.8 reference assemblies **1.0.3**을 사용하며, x64 Windows GUI 실행 파일을 만듭니다. 교차 컴파일 성공은 실제 Windows 실행 검증을 의미하지 않습니다. Windows 10/11 x64, .NET Framework 4.8, Microsoft Edge WebView2 Runtime이 필요합니다. 초기 의존성 복원 및 Runtime 설치에는 인터넷 연결이 필요할 수 있습니다.

출력은 `host/bin/ClassDesk.exe`, `ClassDesk.ico`, `Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll`, `WebView2Loader.dll`, `ClassDesk.exe.config`(SDK 빌드), `WebView2-LICENSE.txt`입니다. `host/bin/`과 `host/lib/`는 커밋하지 않습니다. **`host/bin/`과 `prototype/`의 상대 위치를 유지**하세요. 실행 파일이 `../../prototype`을 찾으므로 EXE만 단독으로 옮기면 실행되지 않습니다.

## 실행과 데이터

| 인수 | 동작 |
| --- | --- |
| 없음 | 배경을 시작하고 설정 창을 엽니다. 이미 실행 중이면 기존 설정 창을 엽니다. |
| `--autostart` | 설정 창 없이 시작합니다. |
| `--settings` | 실행 중인 인스턴스의 설정 창을 엽니다. |
| `--menu` | 실행 중인 인스턴스의 트레이 메뉴를 엽니다. |
| `--exit` | 정상 종료하고 Windows의 원래 배경을 다시 표시합니다. |
| `--exit-installed` | 설치 프로그램용: 현재 EXE와 경로가 같은 인스턴스만 정상 종료합니다. |

- 트레이 아이콘을 누르거나 **Ctrl+Alt+K**로 메뉴를 엽니다. 설정은 트레이 아이콘을 두 번 클릭해도 열립니다. 다른 앱이 단축키를 점유했다면 트레이 메뉴를 사용하세요.
- 기본 배경은 `chalkboard`이며 잘못된 저장 테마도 `chalkboard`로 되돌립니다. 테마는 로컬 `prototype/themes.json`에서 읽습니다.
- 기본 UI와 트레이 메뉴는 한국어입니다. 메시지 번역은 `prototype/i18n/ko.json`입니다.
- 설정과 로그는 `%LOCALAPPDATA%\ClassDesk\settings.json`, `host.log`에, 브라우저 캐시는 같은 폴더의 `WebView2/`에 저장됩니다.
- 자동 시작은 현재 사용자의 시작프로그램 폴더 `ClassDesk.lnk`를 우선 사용하며 실패 시 HKCU Run의 `ClassDesk` 값으로 대체합니다. 다른 제품의 데이터와 시작 항목을 이관하거나 변경하지 않습니다.
- 테스트용 절대 경로 환경 변수 `CLASSDESK_PROFILE_DIR`를 사용하면 데이터와 싱글턴 이벤트가 분리되고 자동 시작 쓰기가 비활성화됩니다. 일반 사용 시 설정하지 않습니다.
- 실제 아이콘 사각형을 400ms마다 읽고 바뀔 때만 페이지로 전달합니다. 아이콘을 옮기거나 이름/파일 내용을 읽지 않습니다.
- 전경 창이 최대화·전체화면이면 일시정지하며 트레이에서 수동 일시정지도 가능합니다. 종료 시 배경 설정 자체를 바꾸지 않고 Explorer가 원래 배경을 다시 그리게 합니다.
- 현재 **주 모니터만** 지원합니다. Windows 11 24H2 이상의 Progman 방식과 이전 WorkerW 방식을 유지합니다. Windows 배경이 자동 교체되면 일시적인 깜빡임이 있을 수 있습니다.
- 로그인·구매·자동 업데이트 서버에 연결하지 않습니다. 원본 상품 홈페이지를 여는 메시지도 제거했습니다.

## 페이지 통신

설정 페이지 → 호스트: `hello`, `theme{id}`, `set{theme,key,value}`, `reset{theme}`, `autostart{v}`. 호스트 → 설정: `init`, `icons{vis,r}`, `autostart{v}`.

테마는 `?wallpaper=1`로 열리고 `ready`를 보낸 뒤 `settings{v}`, `icons{vis,r}`, `pause{v}`, `reset`을 받습니다. 수치·불리언뿐 아니라 `groupNames` 객체를 포함한 설정 값도 JSON 그대로 저장하고 전달합니다. 파일 이름은 전송하지 않으며 렌더러는 실제 아이콘을 재배치하지 않습니다.

## 검증 범위

`tests/host-school.test.mjs`는 독립 식별자, 한국어 메시지/치환 토큰, 기본 테마, 자체 아이콘, 빌드·설치 메타데이터를 검사합니다. 원본 revision `9818b577402ff476e1b59da07970c56472713126`의 Win32 아이콘 조회·DPI·데스크톱 부착·일시정지·복원 루틴을 고정 해시로 비교합니다. 이는 Windows에서 실제 Explorer/WebView2 상호작용을 시험한 것과는 다릅니다. 배포 전 Windows에서 테마 전환, 아이콘 이동 반영, 배율, 전체화면 일시정지, 재시작, 자동 시작, 종료 후 원래 배경 복원을 확인해야 합니다.
