#!/usr/bin/env python3
import http.server
import os
import subprocess
import sys


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
STATS_PATH = "/data/stats.json"


class StatsHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] == STATS_PATH:
            subprocess.run(
                [sys.executable, os.path.join(BASE_DIR, "scripts", "build_stats.py")],
                check=True,
                cwd=BASE_DIR,
                env=os.environ.copy(),
            )
        super().do_GET()


def main():
    os.chdir(PUBLIC_DIR)
    server = http.server.ThreadingHTTPServer(("", 8000), StatsHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
