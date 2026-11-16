(function () {
  "use strict";

  var selectAll = document.getElementById("select-all");
  if (!selectAll) return;

  var boxes = document.querySelectorAll('input[name="ids"]');

  selectAll.hidden = false;
  selectAll.addEventListener("change", function () {
    boxes.forEach(function (box) { box.checked = selectAll.checked; });
  });
})();
