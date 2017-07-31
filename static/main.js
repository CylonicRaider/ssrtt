
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

function send(url, nodeID, callback) {
  function updateText(newText) {
    if (newText != null) main.textContent = newText;
    if (main.textContent) {
      main.classList.remove("empty");
    } else {
      main.classList.add("empty");
    }
    if (callback) callback();
  }
  var main = document.getElementById(nodeID);
  var messages = document.getElementById(nodeID + "-msg");
  messages.className = "hl-aside";
  messages.textContent = "Connecting...";
  var ws = new WebSocket(url);
  ws.onopen = function(evt) {
    messages.textContent = "";
    main.classList.add("empty");
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
    if (main.textContent == lastSent) return;
    ws.send("U:" + main.textContent);
    lastSent = main.textContent;
    updateText();
  }
  main.oninput = handleInput;
  main.onchange = handleInput;
  return ws;
}
