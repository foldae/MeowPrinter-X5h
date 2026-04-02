"""Entry point for python-for-android (p4a) webview bootstrap.

When the APK launches, p4a runs this file. It starts the lightweight
HTTP server on 127.0.0.1:8095. The webview bootstrap then loads that
URL to display the frontend.
"""

from meowprinter.server_lite import serve

serve()
