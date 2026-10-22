"""Static file server for local testing.

Python's stock http.server is single-threaded, so a page asking for six
scripts at once loses some of them to connection resets. This serves the
project with a thread per request, and tells browsers never to cache, so
an edit shows up on reload without juggling ?v= numbers.
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '" 200' not in (fmt % args):
            sys.stderr.write('library: ' + (fmt % args) + '\n')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print('serving %s on http://localhost:%d' % (ROOT, port), flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
