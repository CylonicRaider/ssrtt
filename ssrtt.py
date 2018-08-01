#!/usr/bin/env python3
# -*- coding: ascii -*-

import sys, os, re, inspect
import cgi
import weakref, contextlib
import threading
import websocket_server

try: from Queue import Queue
except ImportError: from queue import Queue

THIS_DIR = os.path.dirname(os.path.abspath(inspect.getfile(lambda: None)))

class Stream:
    def __init__(self, code, data=''):
        self.code = code
        self.data = data
        self.locked = False
        self.cond = threading.Condition()
    def __enter__(self):
        return self.cond.__enter__()
    def __exit__(self, *args):
        return self.cond.__exit__(*args)
    def __iter__(self):
        for i in self.iter():
            yield i
    def __call__(self, data):
        with self:
            self.data = data
            self.cond.notifyAll()
    def iter(self, timeout=None):
        while 1:
            with self:
                yield (self.data, self.locked)
                self.cond.wait(timeout)
    def lock(self):
        with self:
            if self.locked: return False
            self.locked = True
            self.cond.notifyAll()
            return True
    def unlock(self):
        with self:
            self.locked = False
            self.cond.notifyAll()

def spawn_thread(func, *args, **kwds):
    thr = threading.Thread(target=func, args=args, kwargs=kwds)
    thr.setDaemon(True)
    thr.start()
    return thr

class SSRTTRequestHandler(
        websocket_server.quick.RoutingWebSocketRequestHandler):

    CACHE = websocket_server.httpserver.FileCache(THIS_DIR)
    STREAMS = weakref.WeakValueDictionary()
    LOCK = threading.RLock()

    @classmethod
    def get_stream(cls, code, data=''):
        with cls.LOCK:
            try:
                ret = cls.STREAMS[code]
            except KeyError:
                ret = Stream(code, data)
                cls.STREAMS[code] = ret
            return ret

    def run_read(self, code):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        old_data, old_locked = None, False
        for data, locked in self.get_stream(code).iter(60):
            if locked != old_locked:
                # Apparently, data are required.
                if locked:
                    self.wfile.write(b'event: busy\ndata\n\n')
                else:
                    self.wfile.write(b'event: hangup\ndata\n\n')
            if data != old_data:
                cdata = data.encode('utf-8')
                event = (b'data: ' + cdata.replace(b'\n', b'\ndata: ') +
                         b'\n\n')
                self.wfile.write(event)
            self.wfile.flush()
            old_data, old_locked = data, locked

    def run_write(self, code):
        stream = self.get_stream(code)
        if not stream.lock():
            self.send_code(409, 'Stream is already being written')
            return
        try:
            conn = self.handshake()
            conn.write_text_frame('U:' + stream.data)
            while 1:
                msg = conn.read_frame()
                if not msg:
                    break
                if msg.msgtype != websocket_server.OP_TEXT:
                    continue
                cnt = msg.content
                if cnt.startswith('U:'):
                    stream(cnt[2:])
        finally:
            stream.unlock()

    def do_GET(self):
        path = self.path.partition('?')[0]
        parts = re.sub('^/|/$', '', path).split('/')
        static = None
        try:
            if path == '/':
                # Landing page
                static = 'index.html'
            elif '' in parts:
                # Sanitize path
                self.send_400()
                return
            elif len(parts) == 1:
                if parts[0] == 'favicon.ico' and not path.endswith('/'):
                    # Special case for favicon
                    static = 'favicon.ico'
                elif not path.endswith('/'):
                    # Ensure streams have a canonical URL
                    self.send_redirect(301, parts[0] + '/')
                    return
                else:
                    # HTML page reading the stream
                    static = 'static/index.html'
            elif len(parts) == 2:
                code = parts[0]
                if path.endswith('/'):
                    # No directories on this level
                    self.send_redirect(301, '../' + parts[-1])
                    return
                elif parts[1] == 'ws':
                    # WebSocket writing the stream
                    self.run_write(code)
                    return
                elif parts[1] == 'get':
                    # Actual stream
                    self.run_read(code)
                    return
                elif parts[1] not in ('.', '..'):
                    # Random static files
                    if '.' in parts[1]:
                        static = 'static/' + parts[1]
                    else:
                        static = 'static/' + parts[1] + '.html'
            elif len(parts) == 3:
                code = parts[0] + '/' + parts[2]
                if path.endswith('/'):
                    # No directories here, too
                    self.send_redirect(301, '../' + parts[-1])
                    return
                elif parts[1] == 'chat':
                    # HTML page for the chat
                    static = 'static/chat.html'
                elif parts[1] == 'ws':
                    # Writing the chat stream
                    self.run_write(code)
                    return
                elif parts[1] == 'get':
                    # Reading the chat stream
                    self.run_read(code)
                    return
            self.send_cache(static and self.CACHE.get(static))
        except IOError:
            pass

def main():
    websocket_server.quick.run(SSRTTRequestHandler)

if __name__ == '__main__': main()
