@echo off
SETLOCAL
SET METEOR_INSTALLATION=%~dp0%
"%~dp0\packages\meteor-tool\1.1.3\mt-os.windows.x86_32\meteor.bat" %*
ENDLOCAL
EXIT /b %ERRORLEVEL%
rem %~dp0\packages\meteor-tool\1.1.3\mt-os.windows.x86_32\meteor.bat