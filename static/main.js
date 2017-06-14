
function replaceSelectedText(replacementText) {
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
function bail(message) {
  var main = document.querySelector("main");
  main.removeAttribute("contenteditable");
  if (message != null) {
    main.className = "nope";
    main.textContent = "): " + message + " :(";
    Autosizer(main)();
  }
}
function info(message) {
  var aside = document.querySelector("aside");
  aside.textContent = message;
}
function footer(message) {
  var footer = document.querySelector("footer");
  footer.textContent = message;
}
function splitURL() {
  return /^(.*)\/([^/]+)\/([^/]*)$/.exec(location.pathname);
}
function initRead(sizes) {
  var m = splitURL();
  var stream = m && m[2], title;
  var main = document.querySelector("main");
  if (stream) {
    title = decodeURI(stream);
    document.title = title;
  } else {
    return bail("Bad URL");
  }
  var blurred = false, updated = false, overridden = false;
  window.setBlur = function(set, isOverride) {
    if (overridden && ! isOverride) {
      /* NOP */
    } else if (set) {
      blurred = true;
    } else {
      blurred = false;
      updated = false;
      notify(false);
    }
    if (isOverride) overridden = true;
  };
  window.addEventListener("blur", function() {
    setBlur(true);
    if (window.parent != window && window.parent.readBlurred)
      window.parent.readBlurred();
  });
  window.addEventListener("focus", function() {
    setBlur(false);
    if (window.parent != window && window.parent.readFocused)
      window.parent.readFocused();
  });
  var source = new EventSource(m[1] + "/" + m[2] + "/get");
  var autosize = Autosizer(main, sizes);
  source.onmessage = function(evt) {
    console.log("[read] UPDATE:", evt.data);
    if (evt.data != main.textContent && blurred && ! updated) {
      updated = true;
      notify(true);
    }
    main.className = "";
    main.textContent = evt.data;
    info("");
    autosize();
  };
  source.onerror = function() {
    info("Reconnecting...");
  };
  window.addEventListener("resize", autosize);
  autosize();
}
function initWrite(sizes) {
  function updateFocus() {
    if (document.activeElement == main) {
      footer("");
    } else {
      footer("Click into the yellow box to type.");
    }
  }
  var m = splitURL();
  var stream = m && m[2];
  var main = document.querySelector("main");
  if (stream) {
    document.title = decodeURI(stream);
  } else {
    return bail("Bad URL");
  }
  window.addEventListener("blur", function() {
    if (window.parent != window && window.parent.writeBlurred)
      window.parent.writeBlurred();
  });
  window.addEventListener("focus", function() {
    if (window.parent != window && window.parent.writeFocused)
      window.parent.writeFocused();
  });
  var wsURL = location.href.replace(/^http/, "ws");
  wsURL = wsURL.replace(/\/[^/]*$/, "/ws");
  var ws = new WebSocket(wsURL);
  ws.onerror = function(evt) {
    console.error(evt);
    bail("Connection failed");
  };
  ws.onmessage = function(evt) {
    if (typeof evt.data != "string") return;
    var p = /^([A-Za-z0-9])(?::([^]*))$/.exec(evt.data);
    var cmd = p[1], data = p[2] || "";
    if (cmd == "U") {
      main.textContent = data;
      autosize();
    }
  };
  ws.onclose = function() {
    info("Connection closed");
    bail(null);
  };
  var oldText = null, lastPing = Date.now();
  setInterval(function() {
    var text = main.textContent, now = Date.now();
    if (text == oldText && now - lastPing < 10000 ||
      ws.readyState != WebSocket.OPEN) return;
    lastPing = now;
    if (text == oldText) {
      console.log("[write] Sending keep-alive...");
      ws.send("P");
      return;
    }
    console.log("[write] UPDATE:", text);
    oldText = text;
    ws.send("U:" + text);
  }, 250);
  var autosize = Autosizer(main, sizes);
  main.onkeydown = function(evt) {
    if (evt.which == 13) { // Return
      evt.preventDefault();
      replaceSelectedText("\n");
      autosize();
    }
  };
  main.onblur = function() {
    updateFocus();
  };
  main.onfocus = function() {
    updateFocus();
  };
  main.oninput = function() {
    autosize();
  };
  window.addEventListener("resize", autosize);
  autosize();
  updateFocus();
}
