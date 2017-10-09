# SSRTT

Shiny Shared Rotating Text Thingy.

This is a [real-time text](https://en.wikipedia.org/wiki/Real-time_text)
communication platform of another kind, namely one that allows you to edit a
single piece of text and others to receive updates in (near) real time.
Conversational use is encouraged by a specific built-in UI.

## Usage

There are two main modes of usage:

To unidirectionally **stream a piece of text**, go to the main page, enter
your stream name, enable or disable "anti-nausea" to taste (this chooses
whether a 3D rotation animation is employed or not), share the "Other side"
link with the recipient(s), open the "Your side" link, and start typing into
the big centered square.

To have a bidirectional **chat** with someone else, go to the main page,
enter the stream names of you and the other side, share the "Other side"
link with your partner, open the "Your side" link, and start typing into the
big square on the right hand-side of the screen.

**Note**: Although the same input fields are used, individual streams are
independent of chat pages, as are chat pages between different user pairs
(so, `userA` can stream and chat with `userB` and `userC` at the same time);
however, chat pages are reciprocal, _i.e._, the "Other side" of `userD`
chatting with `userE` is at the same time the "Your side" of `userE` chatting
with `userD`.

## Running

The SSRTT server depends on a recent version of Python and the
[`websocket_server`](https://github.com/CylonicRaider/websocket-server)
library. To start it, simply run the [`ssrtt.py`](ssrtt.py) file, optionally
passing the following command-line arguments:

- `--host` *IP* — IP address to bind to. Defaults to "all interfaces".
- `--port` *number* — Port number to bind to. Defaults to `8080`.

With the default settings, SSRTT will be available at
[http://localhost:8080/](http://localhost:8080).
