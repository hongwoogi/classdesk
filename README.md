# 교실데스크

선생님의 바탕화면 자료들을 익숙한 학교 풍경으로 묶어 주는 로컬 바탕화면 프로그램입니다.

[Deskland Preview](https://github.com/BLEZZ0102/Deskland) 공개 소스의 독립 파생 버전입니다. 원작자의 공식 배포·인증 제품이 아니며, 별도의 이름·아이콘·설정 폴더를 사용합니다.

## 학교 테마 4종

- **칠판**: 짙은 초록 칠판 위에 가까운 아이콘들을 분필 외곽선으로 묶습니다.
- **운동장**: 작은 학생들이 빽빽한 운동장에서 아이콘 그룹 둘레만 둥글게 비워 흙바닥을 드러냅니다.
- **체육관**: 나무 바닥 위에서 색이 다른 마스킹테이프가 구역을 나눕니다.
- **교실**: 교실 평면도 위에 아이콘마다 네모 책상을 놓고 가까운 책상을 모둠으로 묶습니다.

기존 무료 테마인 **해변**과 **초원**도 유지합니다. 원본의 실제 WebGL 장면을 재사용하고 학교 테마 4종을 더해 총 6종을 제공합니다.

아이콘을 옮기면 가까운 아이콘끼리 다시 묶입니다. 모둠 이름, 묶기 거리, 여백, 선 두께, 구불거림, 선·색칠 방식과 질감을 조절할 수 있습니다. 네트워크 계정·API 키가 필요하지 않습니다.

### 0.3.0의 변경 사항

- **운동장 테마 학생 움직임 개선**: 학생 크기를 기존 대비 약 3배 키워 자연스럽게 서로 겹치며 운동장을 돌아다니도록 개선했습니다. 아이콘이 배치되거나 이동하면 해당 자리의 학생들이 걸어서 비켜나고, 운동장 테마에서는 외곽 경계선 없이 모둠 이름만 깔끔하게 표시합니다.
- **바탕화면 모둠 이름 바로 수정 아이콘**: 모둠 이름 옆 수정 버튼을 상자 테두리 없는 깔끔한 Fluent UI 연필 아이콘으로 개편했습니다.
- **모둠 이름 크기 및 모서리 둥글기 슬라이더**: 설정에서 **모둠 이름 크기**(`11px`~`28px`)를 조절할 수 있으며, **모서리 둥글기**(`0%` 사각형 ~ `100%` 원·타원) 슬라이더로 구역 경계의 둥근 정도를 연속적으로 조절할 수 있습니다.
- 바닥과 학생 스프라이트 시트를 캐시하여 매 프레임 배경 전체를 다시 그리지 않습니다.

### 0.2.0의 변경 사항

- 여러 줄 파일명·선택 강조와 무관하게 실제 아이콘 그림 영역으로 구역을 계산합니다.
- 변경 없는 구역의 경계는 유지하고 움직이거나 달라진 구역만 약 0.28초 동안 자연스럽게 전환합니다. 모션 끄기·동작 줄이기에서는 즉시 최종 상태를 표시합니다.
- 바탕화면의 이름 옆 연필을 누르면 작은 이름 편집창이 열립니다. Enter로 저장하고 Escape 또는 바깥 클릭으로 취소합니다. 이름 표시를 꺼 두면 편집 버튼도 숨깁니다.
- 아이콘 추가·삭제·재정렬 후에도 공간·구성원 정보를 이용해 기존 ID·색·이름을 이어받습니다. 합치기·나누기에서는 한 ID를 한 구역에만 배정하며 가능한 이전 구역을 복구합니다.
- 학교 테마에서 **테두리 구불거림**과 **선만 그리기·안쪽 색칠하기·선과 색칠 함께**를 선택합니다. 초기화는 표현 설정만 되돌리고 이름과 구역 기록은 보존합니다.
- 배경 창은 Alt+Tab 전환 대상에서 제외합니다. 설정 창은 직접 열었을 때만 일반 창으로 표시하고 최소화하면 트레이로 숨깁니다.

## Windows에서 사용

설치형:

1. 설치 파일 ZIP을 압축 해제하고 `ClassDesk-0.3.0-win-x64-Setup.exe`를 실행합니다.
2. 설치 마법사를 따라 진행합니다. 기본 위치는 `%LOCALAPPDATA%\Programs\ClassDesk`이며 현재 사용자 계정에 설치합니다.
3. 설치가 끝나면 시작 메뉴의 **교실데스크**를 실행합니다. 브라우저 주소에 접속해서 사용하는 서비스가 아닙니다.
4. 설정에서 해변·초원·학교 테마 중 하나를 고릅니다. **구역 이름** 입력란 또는 바탕화면 이름 옆 **연필**로 그룹 이름을 바꿉니다. 이름과 설정은 내 기기에 저장됩니다.
5. 실제 아이콘은 Windows 바탕화면에서 옮깁니다. 트레이 메뉴에서 일시 정지·설정·종료를 선택하고, 종료하면 원래 배경으로 돌아갑니다.

Windows의 **설치된 앱 → 교실데스크 → 제거** 또는 시작 메뉴의 제거 항목으로 삭제합니다. 사용자 설정은 `%LOCALAPPDATA%\ClassDesk`에 보존합니다. 자동 시작은 기본으로 강제하지 않고 설정에서 직접 켭니다.

설치 없이 쓰는 포터블 ZIP도 있습니다. **전부 압축 해제**한 뒤 `Start ClassDesk.cmd` 또는 `host\bin\ClassDesk.exe`를 실행합니다. 실행 파일만 따로 옮기지 마세요.

요구 환경: Windows 10·11 64비트, .NET Framework 4.8, Microsoft Edge WebView2 Runtime. Edge 브라우저만 설치되어 있는 것과 WebView2 Runtime은 다릅니다. 설치 프로그램은 .NET Framework 4.8 이상을 확인하고, WebView2가 없으면 Microsoft의 서명을 검증한 설치 도구로 Runtime 설치를 시도하므로 인터넷 연결이 필요합니다. .NET이 없거나 학교 정책이 실행·설치를 제한하면 전산 담당자에게 문의하세요. 교실데스크 자체와 설치 프로그램은 디지털 서명되지 않았으며 기관 보안 정책을 우회하지 않습니다.

실제 Windows 바탕화면 부착·이름 편집 마우스 입력·트레이·Alt+Tab 제외·전체 화면 자동 정지는 Windows 실기기에서 최종 확인해야 합니다. Linux 브라우저 미리보기 또는 교차 컴파일만으로 Windows 실행 검수가 끝났다고 볼 수 없습니다. 편집 버튼은 파일 아이콘과 겹치거나 안전하게 바탕화면에 붙일 수 없으면 숨기며, 다른 프로그램 위로 올리는 우회 방식은 사용하지 않습니다. 수행한 검수 범위는 `docs/QA.md`에 기록합니다.

- 설정·로그: `%LOCALAPPDATA%\ClassDesk`
- 종료 명령: `host\bin\ClassDesk.exe --exit`
- 설정 열기: `host\bin\ClassDesk.exe --settings`
- 기존 Deskland 설정·시작 항목과 공유하지 않습니다.

## 브라우저 미리보기

Node.js 20 이상에서 저장소 폴더를 열고 실행하세요.

```sh
npm start
```

`http://127.0.0.1:5178/`에서 열립니다. 별도 패키지 설치 없이 미리보기를 실행할 수 있습니다.

- 브라우저는 **예시 자료**만 표시합니다. 실제 PC 파일을 읽거나 이동하지 않습니다.
- 아이콘을 끌거나, 선택 후 방향키로 옮깁니다. Shift와 방향키를 함께 누르면 크게 이동합니다.
- 자료 추가, 업무별·모둠·자유 배치, 이동 되돌리기를 사용할 수 있습니다.
- 설정은 해당 브라우저의 로컬 저장소에 저장됩니다. 사생활 보호 모드·저장소 제한에서는 저장되지 않을 수 있습니다.
- 그룹 이름과 안정 ID는 테마별로 저장합니다. 자료가 더해지거나 빠져도 기존 구역을 이어받으며, 표현 설정 초기화로 이름을 지우지 않습니다.
- **배경 이미지 저장**은 현재 배경과 구역을 PNG로 저장하며 파일 아이콘·파일명은 포함하지 않습니다. 저장한 PNG를 일반 정적 배경으로 지정할 수도 있지만, 정적 이미지의 경계는 아이콘 이동에 따라 바뀌지 않습니다.
- 기본 서버는 로컬 주소에만 열립니다. 학교망 외부에 임의로 노출하지 마세요.

## 개발·검수

```sh
npm ci
npm test
npm run test:browser
node tests/browser-improvements.mjs
node tests/browser-playground.mjs
```

검수에는 Python 3와 Chromium이 필요합니다. 브라우저 실행 파일 경로는 `CHROMIUM_PATH` 환경 변수로 지정합니다. 테스트 보고서는 `artifacts/qa/summary.json`, 검수 이미지는 같은 폴더에 저장됩니다. 재현 가능한 포터블 ZIP과 GPL 소스 ZIP은 실제 Windows 호스트를 빌드한 뒤 `python tools/package-portable.py`로 만듭니다.

Windows 소스 빌드:

```powershell
powershell -ExecutionPolicy Bypass -File host\build.ps1
```

원본과 마찬가지로 첫 빌드는 Microsoft WebView2 개발 라이브러리를 내려받습니다. 실제 배포 프로그램의 학교 테마·설정 화면은 외부 이미지나 웹폰트를 요청하지 않습니다.

설치 프로그램 빌드:

- Windows: `powershell -File tools\build-installer.ps1` — NSIS·Microsoft WebView2 설치 도구의 검증 후 빌드합니다.
- Linux: `python3 tools/build-installer-linux.py --makensis /path/to/makensis --osslsigncode /path/to/osslsigncode --bootstrapper /path/to/MicrosoftEdgeWebview2Setup.exe --ca-file /path/to/Microsoft-Root-2011.pem`.
- Linux 빌드에도 실제 NSIS 컴파일러와 서명이 유효한 Microsoft 공식 WebView2 설치 도구가 필요합니다. Microsoft 루트 인증서는 [공식 인증서 저장소](https://www.microsoft.com/pkiops/docs/repository.htm)에서 확인하며, 시스템의 신뢰 저장소를 임의로 수정하지 마세요.
- 설치 프로그램은 대응 GPL 소스 ZIP도 함께 설치합니다. `.manifest.json`은 실제 포함 파일의 해시를, `.sha256`은 설치 파일 해시를 기록합니다. Microsoft 서명 검증은 WebView2 설치 도구에 대한 것이며 교실데스크 자체의 서명을 뜻하지 않습니다.

## 구조

- `prototype/settings.html`, `school-app.mjs`, `school-ui.css`: 한국어 설정·브라우저 미리보기
- `prototype/school-layout.mjs`: 아이콘 공간 묶음과 외곽선 계산
- `prototype/school-scene-model.mjs`, `group-labels.mjs`: 지속 구역 ID·이름 연결, 부분 전환, 실제 이름표·편집 위치 계산
- `prototype/school-renderer.mjs`: 네 가지 학교 장면의 절차적 Canvas 렌더링
- `prototype/playground-crowd.mjs`: 작은 학생 그림·둥근 빈자리·가장자리 학생 전체 숨김
- `prototype/*board.html`, `playground.html`, `gym.html`, `classroom.html`, `school-wallpaper.mjs`: Windows 바탕화면 진입점
- `host/`: 원본의 실제 Windows 아이콘 위치 읽기·WebView2·배경 복구 기능을 유지한 전용 호스트
- `tests/`: 순수 로직·학교용 계약·Windows 연동 메시지·브라우저 동작 검수

## 개인 정보

원본의 아이콘 **좌표 읽기** 구조를 유지합니다. 실제 파일명이나 파일 내용을 읽어 서버에 업로드하지 않습니다. 사용자 계정·분석 추적·원격 수집 기능이 없습니다. 설정과 직접 입력한 모둠 이름은 내 기기에만 저장됩니다. 바탕화면의 실제 아이콘은 운영체제가 표시하며, 교실데스크는 그 뒤의 배경을 그립니다.

현재는 주 모니터를 대상으로 합니다. 다중 모니터 전체 지원, 파일의 자동 이동·분류, 학생 좌석 명단 관리, 애니메이션 영상 내보내기 기능은 이 버전에 포함하지 않습니다.

## 저작권·라이선스

- 원본: Deskland authors, [BLEZZ0102/Deskland](https://github.com/BLEZZ0102/Deskland), 기준 커밋 `9818b577402ff476e1b59da07970c56472713126`.
- 학교용 UI·테마·연동 변경판: ClassDesk contributors.
- 프로젝트 소스와 해당 테마는 **GPL-3.0**입니다. 수정 배포 시 해당 소스와 라이선스를 함께 제공하세요. `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `TRADEMARKS.md`를 확인하세요.
- Deskland의 이름·공식 로고·앱 아이콘에 대한 상표권은 포함되지 않습니다. 이 버전은 별도로 만든 교실데스크 로고를 사용합니다.
- Pretendard는 SIL Open Font License 1.1, Material Symbols는 Apache License 2.0입니다. 글꼴은 프로젝트 안에 포함되며 각 라이선스는 `prototype/assets/fonts/`에 있습니다.
