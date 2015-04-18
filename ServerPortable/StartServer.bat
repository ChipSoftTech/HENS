
:Echo turned off, for debugging comment out the below with :
@echo off

: store a reference to the server directory (the path of %0) and CD there
set SERVER_DIR=%~dp0
cd /D %SERVER_DIR%

: add curl to the path
:http://curl.haxx.se/gknw.net/7.34.0/dist-w32/curl-7.34.0-rtmp-ssh2-ssl-sspi-zlib-idn-static-bin-w32.zip
set PATH=%SERVER_DIR%bin\curl\;%PATH%

: add the git directory and the minimal UNIX to the path
set PATH=%SERVER_DIR%bin\git\cmd;%PATH%
set PATH=%SERVER_DIR%bin\git\bin;%PATH%

: add sqlite directory and path
set PATH=%SERVER_DIR%bin\sqlite\bin;%PATH%

: add node to the path and set NODE_PATH (where node searchs for modules)
set NODEDIR=%SERVER_DIR%bin\node
set PATH=%NODEDIR%;%PATH%
set NODE_PATH=%NODEDIR%\node_modules\;%NODEDIR%\node_modules\npm\node_modules;%NODEDIR%\node_modules\npm;%NODEDIR%\node_modules\sqlite3;

: add meteor 
set PATH=%SERVER_DIR%..\.meteor;%PATH%

start cmd.exe /k "cd ..\code"
exit




