
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
  var main = document.getElementById(nodeID);
  var messages = document.getElementById(nodeID + "-msg");
  messages.className = "hl-aside";
  messages.textContent = "Connecting...";
  var events = new EventSource(url);
  events.onopen = function(evt) {
    messages.textContent = "";
  };
  events.onmessage = function(evt) {
    var text = evt.data;
    if (text == main.textContent) return;
    main.textContent = text;
    if (callback) callback();
  };
  events.onerror = function(evt) {
    console.warn("SSE error", evt);
    messages.className = "hl-error";
    messages.textContent = "Reconnecting...";
  };
  return events;
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

function send(url, nodeID, callback) {
  function updateText(newText) {
    if (newText != null){
      main.textContent = newText;
      main.focus();
      var sel = window.getSelection();
      sel.collapse(main.firstChild, newText.length);
    }
    /* External processing */
    if (callback) callback();
  }
  var main = document.getElementById(nodeID);
  var messages = document.getElementById(nodeID + "-msg");
  messages.className = "hl-aside";
  messages.textContent = "Connecting...";
  var ws = new WebSocket(url);
  ws.onopen = function(evt) {
    messages.textContent = "";
    main.contentEditable = true;
  };
  ws.onmessage = function(evt) {
    var type = evt.data.slice(0, 2);
    var text = evt.data.slice(2);
    if (type != "U:" || text == main.textContent) return;
    updateText(text);
  };
  ws.onerror = function(evt) {
    console.warn("WS error", evt);
    messages.className = "hl-main";
    messages.textContent = "";
  };
  ws.onclose = function(evt) {
    messages.className = "hl-error";
    messages.textContent = "Connection closed";
  };
  var lastSent = null;
  function handleInput() {
    updateText();
    if (main.textContent == lastSent) return;
    ws.send("U:" + main.textContent);
    lastSent = main.textContent;
  }
  main.oninput = handleInput;
  main.onchange = handleInput;
  main.onkeydown = function(event) {
    if (event.keyCode == 13) { // Return
      replaceSelection("\n");
      event.preventDefault();
    }
  };
  return ws;
}
