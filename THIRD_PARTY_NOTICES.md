# 第三方依赖 / Third-party dependencies

## Microsoft Edge WebView2

Windows 宿主使用 Microsoft Edge WebView2 SDK 与 WebView2 Runtime。构建脚本从 NuGet 获取开发库，本仓库不提交 SDK 二进制文件。

- 包：`Microsoft.Web.WebView2`，构建版本 `1.0.4191.47`。
- 包与许可信息：https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4191.47
- 文档：https://learn.microsoft.com/microsoft-edge/webview2/

WebView2 及 Windows / .NET Framework 组件适用各自的许可条款，不因本项目的 GPL-3.0 许可而变更。

The host uses the Microsoft Edge WebView2 SDK and Runtime. SDK binaries are downloaded by the build script and are not checked into this repository. Microsoft components retain their respective licenses.

## ClassDesk에 포함된 글꼴

- Pretendard Variable 1.3.9: Copyright (c) 2021 Kil Hyung-jin; SIL Open Font License 1.1. 라이선스: `prototype/assets/fonts/Pretendard-LICENSE.txt`. 원본: https://github.com/orioncactus/pretendard
- Material Symbols Rounded: Google; Apache License 2.0. UI에 필요한 심볼만 포함한 WOFF2 파일을 로컬에 저장합니다. 라이선스: `prototype/assets/fonts/MaterialSymbols-LICENSE.txt`. 원본: https://github.com/google/material-design-icons

이 글꼴과 Microsoft 라이브러리의 라이선스는 프로젝트의 GPL-3.0으로 변경되지 않습니다.

## NSIS

Windows 安装包使用 NSIS 3.13 制作。便携编译器仅在构建时下载，不作为项目源码提交。NSIS 及其压缩模块适用各自许可，详见 https://nsis.sourceforge.io/License 。安装包附带项目对应源码 ZIP。
