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
    def iter(self, timeout=None, only_update=False):
        old = None
        while 1:
            with self:
                if only_update:
                    if self.data != old:
                        old = self.data
                        yield self.data
                    else:
                        yield None
                else:
                    yield self.data
                self.cond.wait(timeout)
    def lock(self):
        with self:
            if self.locked: return False
            self.locked = True
            return True
    def unlock(self):
        with self:
            self.locked = False

def spawn_thread(func, *args, **kwds):
    thr = threading.Thread(target=func, args=args, kwargs=kwds)
    thr.setDaemon(True)
    thr.start()
    return thr

class SSRTTRequestHandler(websocket_server.WebSocketRequestHandler):

    FORBIDDEN = b'403 Forbidden'
    NOT_FOUND = b'404 Not Found'
    MOVED_PERMANENTLY = '<html><a href="%s">Continue here</a></html>'
    CACHE = websocket_server.quick.FileCache(THIS_DIR)
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

    def send_string(self, code, s):
        self.send_response(code, len(s))
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', len(s))
        self.end_headers()
        self.wfile.write(s)
    def send_403(self):
        self.send_string(403, self.FORBIDDEN)
    def send_404(self):
        self.send_string(404, self.NOT_FOUND)

    def redirect_301(self, location):
        body_str = self.MOVED_PERMANENTLY % cgi.escape(location, True)
        body = body_str.encode('utf-8')
        self.send_response(301, len(body))
        self.send_header('Location', location)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.partition('?')[0]
        parts = re.sub('/+', '/', path.strip('/')).split('/')
        ent = None
        try:
            if len(parts) == 1:
                if parts[0] == '':
                    ent = self.CACHE.get('index.html')
                elif not path.endswith('/'):
                    # Ensure streams have a canonical URL.
                    self.redirect_301(parts[0] + '/')
                    return
                else:
                    # HTML page reading the stream
                    ent = self.CACHE.get('static/index.html')
            elif len(parts) == 2:
                code = parts[0]
                if parts[1] == 'ws':
                    # WebSocket writing the stream
                    stream = self.get_stream(code)
                    if not stream.lock():
                        self.send_string(409, b'409 Conflict\n'
                            b'Stream is already being written')
                        return
                    try:
                        conn = self.handshake()
                        conn.write_text_frame('U:' + stream.data)
                        while 1:
                            msg = conn.read_frame()
                            if not msg: break
                            if msg.msgtype != websocket_server.OP_TEXT:
                                continue
                            cnt = msg.content
                            if cnt.startswith('U:'):
                                stream(cnt[2:])
                    finally:
                        stream.unlock()
                elif parts[1] == 'get':
                    # Actual stream
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/event-stream')
                    self.end_headers()
                    for i in self.get_stream(code).iter(10, True):
                        if i is None:
                            self.wfile.write(b'event: ping\n\n')
                            self.wfile.flush()
                            continue
                        ci = i.encode('utf-8')
                        ri = (b'data: ' + ci.replace(b'\n', b'\ndata: ') +
                              b'\n\n')
                        self.wfile.write(ri)
                        self.wfile.flush()
                elif parts[1] not in ('.', '..'):
                    # Random static files.
                    lpath = 'static/' + parts[1]
                    ent = (self.CACHE.get(lpath) or
                           self.CACHE.get(lpath + '.html'))
            elif len(parts) == 3:
                if parts[1] == 'chat':
                    ent = self.CACHE.get('static/chat.html')
            if ent:
                ent.send(self)
            else:
                self.send_404()
        except IOError:
            pass

def main():
    websocket_server.quick.run(SSRTTRequestHandler)

if __name__ == '__main__': main()
