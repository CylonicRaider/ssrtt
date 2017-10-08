
/*** Utilities ***/

function $id(id) {
  return document.getElementById(id);
}
function $sel(sel, node) {
  return (node || document).querySelector(sel);
}

function replaceSelection(replacementText) {
  /* Adapted from http://stackoverflow.com/a/3997896 */
  var sel = window.getSelection();
  if (sel.rangeCount) {
    var range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(replacementText));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
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
      var localSoftNL = (node.tagName == "DIV" || node.tagName == "P");
      softNL |= localSoftNL;
      Array.prototype.forEach.call(node.childNodes, traverse);
      if (node.tagName == "BR") {
        ret += (softNL) ? "\n\n" : "\n";
        softNL = false;
        trimNL = true;
      } else {
        softNL |= localSoftNL;
      }
    } else if (node.nodeType == Node.TEXT_NODE) {
      if (softNL) ret += "\n";
      ret += node.nodeValue;
      softNL = false;
    }
  }
  var ret = "", softNL = false, trimNL = false;
  traverse(node);
  if (trimNL && ret.endsWith("\n")) ret = ret.substring(0, ret.length - 1);
  return ret;
}

/*** Data ***/

var BIG_SIZES   = ["2.5vmin", "3.75vmin", "5vmin", "7.5vmin", "10vmin",
                   "15vmin", "20vmin", "25vmin"];
var SMALL_SIZES = ["2.5vmin", "3.75vmin", "5vmin", "7.5vmin", "10vmin",
                   "15vmin"];

/*** Main code ***/

function prepare(sending) {
  var m, u;
  m = /\/([^/]+)\/[^/]*$/.exec(location.href);
  document.title = m[1];
  if (sending) {
    u = location.href.replace(/^http/, "ws").replace(/[^/]*$/, "ws");
  } else {
    u = location.href.replace(/[^/]*$/, "get");
  }
  return u;
}

function receive(url, nodeID, callback) {
  var main = $id(nodeID);
  var message = new Messager(nodeID + "-msg");
  message("Connecting...", "aside");
  var events = new EventSource(url);
  events.onopen = function(evt) {
    message("");
  };
  events.addEventListener("message", function(evt) {
    var text = evt.data;
    if (text == main.textContent) return;
    main.textContent = text;
    if (callback) callback();
  });
  events.addEventListener("busy", function(evt) {
    message("");
  });
  events.addEventListener("hangup", function(evt) {
    message("Sender hung up");
  });
  events.onerror = function(evt) {
    console.warn("SSE error", evt);
    message("Reconnecting...", "error");
  };
  return events;
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
  function handleOpen(evt) {
    message("");
    main.contentEditable = true;
  }
  function handleMessage(evt) {
    var type = evt.data.slice(0, 2);
    var text = evt.data.slice(2);
    if (type != "U:") {
      return;
    } else if (lastSent != null) {
      ws.send("U:" + lastSent);
    } else {
      updateText(text);
    }
  }
  function handleError(evt) {
    console.warn("WS error", evt);
    message("");
  }
  function handleClose(evt) {
    message("Connection closed", "error");
    ws = new WebSocket(url);
    ws.onopen = handleOpen;
    ws.onmessage = handleMessage;
    ws.onerror = handleError;
    ws.onclose = handleClose;
  }
  var main = $id(nodeID);
  var message = new Messager(nodeID + "-msg");
  message("Connecting...", "aside");
  var ws = new WebSocket(url);
  ws.onopen = handleOpen;
  ws.onmessage = handleMessage;
  ws.onerror = handleError;
  ws.onclose = handleClose;
  var lastSent = null;
  function handleInput() {
    updateText();
    var text = getNodeText(main);
    if (text == lastSent) return;
    ws.send("U:" + text);
    lastSent = text;
  }
  main.oninput = handleInput;
  main.onchange = handleInput;
  return ws;
}
