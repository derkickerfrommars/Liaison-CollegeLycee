#!/usr/bin/env python3
import http.server, socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

with socketserver.TCPServer(('127.0.0.1', 8080), NoCacheHandler) as httpd:
    httpd.serve_forever()
