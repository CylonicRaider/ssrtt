
/*** Utilities ***/

function $id(id) {
  return document.getElementById(id);
}
function $sel(sel, node) {
  return (node || document).querySelector(sel);
}

function Messager(node) {
  if (typeof node == "string")
    node = $id(node);
  return function(text, level) {
    node.className = (level) ? "hl-" + level : "";
    node.textContent = text;
  };
}

function Autosizer(measure, node, sizes) {
  var curIdx = sizes.length - 1;
  var oldHeight = null;
  node.style.fontSize = sizes[curIdx];
  return function() {
    /* Avoid unnecessary updates */
    if (node.scrollHeight == oldHeight) return;
    oldHeight = node.scrollHeight;
    /* Try shrinking */
    var shrunk = false;
    while (measure.scrollHeight > measure.clientHeight && curIdx > 0) {
      node.style.fontSize = sizes[--curIdx];
      shrunk = true;
    }
    if (shrunk) return;
    /* Otherwise, try growing until too large, and then back off */
    while (++curIdx < sizes.length) {
      node.style.fontSize = sizes[curIdx];
      if (measure.scrollHeight > measure.clientHeight) {
        node.style.fontSize = sizes[--curIdx];
        break;
      }
    }
    /* Word wrapping hysteresis (yes, indeed) can lead to the downscaled
     * text being still too big. Let's hope one notch suffices. */
    if (measure.scrollHeight > measure.clientHeight && curIdx > 0)
      node.style.fontSize = sizes[--curIdx];
  };
}

function Notifier() {
  var visible = document.hasFocus();
  window.onblur = function() {
    visible = false;
  }
  window.onfocus = function() {
    visible = true;
    notify(false);
  }
  return function() {
    if (! visible) notify(true);
  };
}

function notify(status) {
  var m = /^(.*?)( \*)*$/.exec(document.title);
  document.title = (status) ? m[1] + " *" : m[1];
}

// TODO: Allow normalizing node to a sequence of text with DIV-s or BR-s?
function getNodeText(node) {
  function traverse(node) {
    if (node.nodeType == Node.ELEMENT_NODE) {
      var isLFNode = (node.tagName == "DIV" || node.tagName == "P" ||
                      node.tagName == "BR");
      if (isLFNode) addLF = true;
      Array.prototype.forEach.call(node.childNodes, traverse);
      if (isLFNode) addLF = true;
      if (node.tagName == "BR") addText("");
    } else if (node.nodeType == Node.TEXT_NODE) {
      addText(node.nodeValue);
    }
  }
  function addText(text) {
    if (addLF && ret) ret += "\n";
    addLF = false;
    ret += text;
  }
  var ret = "", addLF = false;
  traverse(node);
  return ret;
}

/*** Data ***/

var BIG_SIZES   = ["2.5vmin", "3.75vmin", "5vmin", "7.5vmin", "10vmin",
                   "15vmin", "20vmin", "25vmin"];
var SMALL_SIZES = ["2.5vmin", "3.75vmin", "5vmin", "7.5vmin", "10vmin",
                   "15vmin"];

/*** Main code ***/

function prepare(sending) {
  var m, url;
  m = /\/([^/]+)\/[^/]*$/.exec(location.href);
  document.title = decodeURIComponent(m[1]);
  if (sending) {
    url = location.href.replace(/^http/, "ws").replace(/[^/]*$/, "ws");
  } else {
    url = location.href.replace(/[^/]*$/, "get");
  }
  return url;
}

function connect(url, label, callback) {
  function doConnect() {
    if (/^wss?:/.test(url)) {
      carrier = new WebSocket(url);
    } else {
      carrier = new EventSource(url);
    }
    carrier.onopen = handleOpen;
    carrier.onmessage = handleMessage;
    carrier.onerror = handleError;
    carrier.onclose = handleClose;
    callback.call(carrier, "connect");
    return carrier;
  }
  function handleOpen(evt) {
    callback.call(carrier, "open", evt);
  }
  function handleMessage(evt) {
    var type, text;
    if (/^.:/.test(evt.data)) {
      type = evt.data.slice(0, 1);
      text = evt.data.slice(2);
    } else {
      type = null;
      text = evt.data;
    }
    callback.call(carrier, "message", evt, type, text);
  }
  function handleError(evt) {
    console.warn(label + " error:", evt);
    callback.call(carrier, "error", evt);
  }
  function handleClose(evt) {
    try {
      callback.call(carrier, "close", evt);
    } finally {
      if (/^wss?:/.test(url)) {
        carrier = doConnect();
      } else {
        console.error(label + " closed unexpectedly!", evt);
      }
    }
  }
  var carrier;
  callback("init");
  return doConnect();
}

function receive(url, nodeID, callback) {
  var main = $id(nodeID);
  var message = new Messager(nodeID + "-msg");
  var desc = (/^wss?:/.test(url)) ? "Receiving WebSocket" : "SSE";
  connect(url, desc, function(code, evt, type, text) {
    switch (code) {
      case "init":
        message("Connecting...", "aside");
        break;
      case "open":
        message("");
        break;
      case "message":
        switch (type) {
          case "t":
            if (text == main.textContent) return;
            main.textContent = text;
            if (callback) callback();
            break;
          case "s":
            switch (text) {
              case "active":
                message("");
                break;
              case "hangup":
                message("Sender hung up");
                break;
              default:
                console.warn("Unrecognized sender status:", text);
                break;
            }
            break;
          default:
            console.warn(desc + ": Unrecognized message:", evt.data);
            break;
        }
        break;
      case "error":
      case "close":
        message("Reconnecting...", "error");
        break;
    }
  });
}

function send(url, nodeID, callback) {
  function updateText(newText) {
    if (newText != null) {
      main.textContent = newText;
      main.focus();
      var sel = window.getSelection();
      sel.collapse(main.firstChild, newText.length);
    }
    /* External processing */
    if (callback) callback();
  }
  function handleInput() {
    updateText();
    var text = getNodeText(main);
    if (text == lastSent || ! ws) return;
    ws.send("T:" + text);
    lastSent = text;
  }
  var main = $id(nodeID);
  var message = new Messager(nodeID + "-msg");
  var lastSent = null;
  var ws = null;
  main.oninput = handleInput;
  main.onchange = handleInput;
  connect(url, "WebSocket", function(code, evt, type, text) {
    switch (code) {
      case "init":
        message("Connecting...", "aside");
        break;
      case "connect":
        ws = this;
        break;
      case "open":
        message("");
        main.contentEditable = true;
        break;
      case "message":
        switch (type) {
          case "t":
            if (lastSent != null) {
              this.send("T:" + lastSent);
            } else {
              updateText(text);
            }
            break;
          default:
            console.warn("Unrecognized WebSocket message:", evt.data);
            break;
        }
        break;
      case "close":
        message("Connection closed", "error");
        break;
    }
  });
}
