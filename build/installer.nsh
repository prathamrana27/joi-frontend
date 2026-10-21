; Custom NSIS steps for the JOI installer (included by electron-builder).
;
; Gives the Start Menu and Desktop shortcuts a Windows launch hotkey, so Ctrl+Alt+J
; opens JOI even when it isn't running. (Windows only honors hotkeys on shortcuts in
; these two locations.) While JOI is running, the app's own global shortcut handles
; the same keys and toggles the window; a second launch just focuses the running app.

!macro customInstall
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL CONTROL|ALT|J "Your calm, capable assistant"
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL CONTROL|ALT|J "Your calm, capable assistant"
!macroend
