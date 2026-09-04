# MASTER-25 Native static QC note

This note records the final static/native-toolchain QC pass performed before real iOS Simulator and Android Emulator execution.

## iOS

- `Package.swift` package name is `ViraNative`, but the exported product/scheme is `ViraIOS`.
- The RC runner and hosted iOS build must use `ViraIOS`; `ViraNative` is not the product scheme.
- The local simulator runner validates the scheme through `xcodebuild -list -json` before selecting/booting an iPhone Simulator.
- UIKit-gated source remains verified only by a real Apple SDK build/test; macOS `swift test` alone is not considered sufficient.

## Android

- AGP 9.4.0 is paired with Gradle >= 9.6.0, JDK 17 in hosted CI, compileSdk 36 and Build Tools 36.0.0.
- Built-in Kotlin source directories use the supported `android.sourceSets.*.kotlin` DSL.
- The emulator RC runner now fails closed unless Android SDK platform 36, Build Tools 36.0.0, Gradle >= 9.6 and a fully booted `emulator-*` device are present.
- Device instrumentation still compiles against the public `xyz.tryvira.android` package surface.

This static review reduces configuration/toolchain risk but does not replace the final real simulator/emulator execution required by MASTER-25.
