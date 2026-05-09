#!/usr/bin/env python3
"""
Mock OpenAI-compatible upstream server for integration testing.

- GET /v1/models: returns a fixed list
- POST /v1/chat/completions (stream=false): returns a canned JSON with usage
- POST /v1/chat/completions (stream=true): emits several SSE chunks, ending with
  a chunk that includes `usage` (requires include_usage on real OpenAI; we emit
  it unconditionally for testing) and then `data: [DONE]`.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import time


class Handler(BaseHTTPRequestHandler):
    def _auth_ok(self):
        h = self.headers.get("Authorization", "")
        return h.startswith("Bearer ")

    def do_GET(self):
        if self.path == "/v1/models":
            if not self._auth_ok():
                self.send_response(401); self.end_headers(); return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "object": "list",
                "data": [
                    {"id": "gpt-4o", "object": "model", "created": 1719000000, "owned_by": "openai"},
                    {"id": "gpt-4o-mini", "object": "model", "created": 1721000000, "owned_by": "openai"},
                ]
            }).encode())
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_response(404); self.end_headers(); return
        if not self._auth_ok():
            self.send_response(401); self.end_headers(); return

        length = int(self.headers.get("Content-Length", "0"))
        body_raw = self.rfile.read(length)
        try:
            body = json.loads(body_raw)
        except Exception:
            self.send_response(400); self.end_headers(); return

        model = body.get("model", "gpt-4o")
        stream = body.get("stream", False)

        if not stream:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": "Hello from mock!"},
                    "finish_reason": "stop",
                }],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            }).encode())
            return

        # Streaming
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def send(chunk):
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()

        send({"id": "x", "object": "chat.completion.chunk", "model": model,
              "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]})
        time.sleep(0.05)
        send({"id": "x", "object": "chat.completion.chunk", "model": model,
              "choices": [{"index": 0, "delta": {"content": "Hello"}, "finish_reason": None}]})
        time.sleep(0.05)
        send({"id": "x", "object": "chat.completion.chunk", "model": model,
              "choices": [{"index": 0, "delta": {"content": " stream"}, "finish_reason": None}]})
        time.sleep(0.05)
        # Final chunk with usage (OpenAI emits this when include_usage=true)
        send({"id": "x", "object": "chat.completion.chunk", "model": model,
              "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
              "usage": {"prompt_tokens": 7, "completion_tokens": 12, "total_tokens": 19}})
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *a, **k):
        return


if __name__ == "__main__":
    port = 9101
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
