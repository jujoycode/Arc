"""Local provider HTTP fixture for disposable acceptance installations only."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

denied = set()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ready": True})
        if self.path in ("/repos/arc-fixture/repo", "/repositories/101"):
            if "GITHUB" in denied or self.headers.get("Authorization") != "Bearer arc-fixture-token-123":
                return self.reply(403, {})
            return self.reply(200, {"id": 101, "full_name": "arc-fixture/repo"})
        if self.path in ("/api/v4/projects/arc-fixture%2Frepo", "/api/v4/projects/201"):
            if "GITLAB" in denied or self.headers.get("PRIVATE-TOKEN") != "arc-fixture-token-123":
                return self.reply(403, {})
            return self.reply(200, {"id": 201, "path_with_namespace": "arc-fixture/repo"})
        return self.reply(404, {})

    def do_POST(self):
        if self.path == "/control/github-deny":
            denied.add("GITHUB")
        elif self.path == "/control/github-allow":
            denied.discard("GITHUB")
        else:
            return self.reply(404, {})
        self.reply(200, {})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
