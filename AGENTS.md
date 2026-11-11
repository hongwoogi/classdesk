# 교실데스크 개발 기준

이 저장소는 Deskland Preview의 GPL-3.0 소스를 바탕으로 한 독립 학교용 파생 버전입니다. 사용자가 승인한 학교 테마·한국어 UI를 개발합니다. 원본의 상표·앱 아이콘·공식 배포 정체성을 사용하지 않습니다.

- 사용자에게 보이는 문구는 자연스러운 한국어로 작성합니다. 제품 이름은 `교실데스크`, 실행 파일과 영문 식별자는 `ClassDesk`입니다.
- 기본 테마는 `chalkboard`입니다. 사용 가능한 테마는 `chalkboard`, `playground`, `gym`, `classroom` 네 가지입니다. 모든 테마는 무료이며 구매·로그인·원격 업데이트 기능은 추가하지 않습니다.
- `prototype/settings.html`은 브라우저와 Windows WebView2에서 공용입니다. 브라우저에서는 예시 아이콘만 사용합니다. 실제 바탕화면 아이콘은 Windows 호스트가 읽어 보낸 좌표만 반영합니다.
- 실제 파일 이동·삭제·이름 수집 또는 업로드를 구현하지 않습니다. 브라우저의 예시 아이콘 이동·삭제와 Windows의 실제 파일을 혼동하지 않도록 안내합니다.
- 네 테마의 공통 계산은 `school-layout.mjs`, 배경 그리기는 `school-renderer.mjs`, 설정 화면은 `school-app.mjs`, 네이티브 배경 진입점은 `school-wallpaper.mjs`에 둡니다.
- native protocol: `icons {vis,r}` 배열은 물리 픽셀의 `[left,top,right,bottom]`입니다. WebView2의 기기 배율을 적용해 CSS 좌표로 변환합니다. `settings {v}`, `reset`, `pause {v}`와 최초 `ready`를 지원합니다.
- 일시 정지 상태에서도 처음 도착한 아이콘·설정은 정적 화면에 반영해야 합니다. 정적 배경을 매 프레임 재생성하지 않습니다. 환경 설정의 움직임 끄기와 `prefers-reduced-motion`을 존중합니다.
- 아이콘이 여러 모둠을 이루는지, 드래그·키보드 이동 후 외곽선이 실제로 갱신되는지 검사합니다. 네모 책상은 아이콘마다 하나씩 렌더링합니다.
- 새 동작·오류 수정은 먼저 재현 테스트를 작성해 실패를 확인한 뒤 구현합니다. 순수 로직은 Node 내장 테스트를 사용하며 브라우저 검수는 Playwright로 실행합니다.
- 확인 명령: `npm test`, `npm run test:browser`. 미리보기: `npm start` → `http://127.0.0.1:5178/`.
- Windows 호스트는 C# 5 문법과 .NET Framework 호환성을 유지합니다. 데이터 폴더·이벤트·시작 항목·프로그램 아이콘은 원본과 독립적이어야 합니다.
- 교차 컴파일 성공과 Windows 실기기 실행 검수는 다른 결과입니다. 수행하지 않은 실기기 검수를 통과로 보고하지 않습니다.
- 소스·공개 파일에 개인 정보, 비밀 키, 로컬 인증 설정을 넣지 않습니다. `host/bin`, `host/lib`, `host/obj`, `node_modules`, `dist`, `artifacts`는 소스 Git에 포함하지 않습니다.
- 배포할 때 GPL 원문·원본 저작권·변경 고지·글꼴 라이선스를 보존하고 실행 파일에 대응하는 전체 소스 ZIP을 함께 제공합니다.
