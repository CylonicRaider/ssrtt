
function notify(doNotify) {
  var m = /^(.*?)( \*)*$/.exec(document.title);
  document.title = (doNotify) ? m[1] + " *" : m[1];
  if (window.parent != window && window.parent.notify)
    window.parent.notify(doNotify);
}

function Autosizer(node, sizes) {
  var oldWidth = null, oldHeight = null, oldLen = null;
  return function() {
    if (node.offsetWidth != oldWidth || node.offsetHeight != oldHeight ||
        node.textContent.length < oldLen) {
      var canceled = false;
      sizes.forEach(function(el) {
        if (canceled) return;
                    node.style.fontSize = el;
        if (node.offsetWidth <= document.documentElement.offsetWidth &&
            node.offsetHeight <= document.documentElement.offsetHeight)
          canceled = true;
      });
      oldWidth = node.offsetWidth;
      oldHeight = node.offsetHeight;
      oldLen = node.textContent.length;
    }
  };
}
