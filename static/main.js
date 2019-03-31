
/*** Utilities ***/

function $id(id) {
  return document.getElementById(id);
}
function $sel(sel, node) {
  return (node || document).querySelector(sel);
}

function $query(input) {
  if (input == null) input = location.search.replace(/^\?/, "");
  var regex = /&?([^&=]+)(?:=([^&]*))?(?=&|$)|($)/g, ret = {};
  for (;;) {
    var m = regex.exec(input);
    if (! m) return null;
    if (m[3] != null) break;
    var n = decodeURIComponent(m[1]);
    var v = (m[2] == null) ? true : decodeURIComponent(m[2]);
    if (ret[n] == null) {
      ret[n] = v;
    } else if (typeof ret[n] == "object") {
      ret[n].push(v);
    } else {
      ret[n] = [ret[n], v];
    }
  }
  return ret;
}

function Messager(node) {
  if (typeof node == "string")
    node = $id(node);
  return function(text, level) {
    node.className = (level) ? "hl-" + level : "";
    node.textContent = text;
  };
}

Messager.forNode = function(node) {
  if (! node) return function(text, label) {};
  var messagerID = node.getAttribute("data-messager");
  if (messagerID == null) messagerID = node.id + "-msg";
  return new this(messagerID);
};

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

var SIZES = ["2.5vmin", "3.75vmin", "5vmin", "7.5vmin", "10vmin", "15vmin",
             "20vmin", "25vmin"];

/*** Main code ***/

function prepare(sending) {
  var m = /\/([^/]+)\/[^/]*$/.exec(location.href);
  document.title = decodeURIComponent(m[1]);
  if ($query().disco) $id("main").className += " rotate";
  var url;
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

function runDisplay(url, readNode, writeNode, callback) {
  function bothMessage(text, level) {
    readMessage(text, level);
    writeMessage(text, level);
  }
  function updateReadText(text) {
    if (text == readNode.textContent) return;
    readNode.textContent = text;
    if (callback) callback("read");
  }
  function updateWriteText(newText) {
    if (newText != null) {
      writeNode.textContent = newText;
      writeNode.focus();
      var sel = window.getSelection();
      sel.collapse(writeNode.firstChild, newText.length);
    }
    /* External processing */
    if (callback) callback("write");
  }
  function handleWriteInput() {
    updateWriteText();
    var text = getNodeText(writeNode);
    if (text == lastSent || ! ws) return;
    ws.send("T:" + text);
    lastSent = text;
  }
  if (typeof readNode == "string") readNode = $id(readNode);
  if (typeof writeNode == "string") writeNode = $id(writeNode);
  var readMessage = Messager.forNode(readNode);
  var writeMessage = Messager.forNode(writeNode);
  var isWS = /^wss?:/.test(url);
  var label = (isWS) ? "WebSocket" : "SSE stream";
  var ws, lastSent;
  if (writeNode) {
    writeNode.oninput = handleWriteInput;
    writeNode.onchange = handleWriteInput;
  }
  connect(url, label, function(code, evt, type, text) {
    switch (code) {
      case "init":
        bothMessage("Connecting...", "aside");
        break;
      case "connect":
        if (isWS) ws = this;
        break;
      case "open":
        bothMessage("");
        if (writeNode) writeNode.contentEditable = true;
        break;
      case "message":
        switch (type) {
          case "e":
            if (! writeNode) {
              /* NOP */
            } else if (lastSent != null) {
              if (ws) ws.send("T:" + lastSent);
            } else {
              updateWriteText(text);
            }
            break;
          case "t":
            if (! readNode) break;
            updateReadText(text);
            break;
          case "s":
            switch (text) {
              case "active":
                readMessage("");
                break;
              case "hangup":
                readMessage("Sender hung up");
                break;
              default:
                console.warn("Unrecognized sender status:", text);
                break;
            }
            break;
          default:
            console.warn(label + ": Unrecognized message:", evt.data);
            break;
        }
        break;
      case "error":
      case "close":
        if (isWS) {
          bothMessage("Connection closed", "error");
        } else {
          bothMessage("Reconnecting...", "error");
        }
        break;
    }
  });
}

function receive(url, nodeID, callback) {
  runDisplay(url, nodeID, null, callback);
}

function send(url, nodeID, callback) {
  runDisplay(url, null, nodeID, callback);
}
