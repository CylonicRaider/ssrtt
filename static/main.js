
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

function traverseDOM(node, callback) {
  callback(node, "in");
  for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
    traverseDOM(ch, callback);
  }
  callback(node, "out");
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
    } else {
      /* Check for non-text nodes */
      var allText = true;
      for (var ch = main.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType != Node.TEXT_NODE) {
          // Ignore final <span>.
          if (ch.nodeName == "SPAN" && ! ch.childNodes &&
              ! ch.nextSibling)
            continue;
          allText = false;
        }
      }
      /* Exterminate! */
      if (! allText) {
        var sel = window.getSelection();
        var savedText = null, curText = "", softNewline = false;
        // FIXME: Not handling focus between element nodes (an Element as
        //        the focusAnchor).
        traverseDOM(main, function(node, state) {
          if (node == main) {
            return;
          } else if (node.nodeType == Node.TEXT_NODE) {
            if (state == "out") {
              /* Do not handle text nodes twice */
              return;
            } else if (node == sel.focusNode) {
              /* Handle selection focus */
              if (softNewline) curText += "\n";
              savedText = curText + node.data.substring(0, sel.focusOffset);
              curText = node.data.substring(sel.focusOffset);
              softNewline = false;
            } else {
              if (softNewline) curText += "\n";
              curText += node.data;
              softNewline = false;
            }
          } else if (node.nodeType == Node.ELEMENT_NODE) {
            /* Newlines for consecutive <BR>-s. */
            if (node.nodeName == "BR" && state == "in" && softNewline)
              curText += "\n";
            /* Add newlines around P, DIV, BR. */
            if (node.nodeName == "P" || node.nodeName == "BR" ||
                node.nodeName == "DIV")
              softNewline = true;
          } else {
            console.warn("Unknown node in text area:", node);
          }
        });
        if (savedText == null) {
          savedText = curText;
          curText = "";
        }
        main.textContent = savedText + curText;
        if (main.firstChild) {
          sel.collapse(main.firstChild, savedText.length);
        } else {
          sel.collapse(main, 0);
        }
      }
      main.appendChild(document.createElement("span"));
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
