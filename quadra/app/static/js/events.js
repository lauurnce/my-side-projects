(function () {
  "use strict";

  var buttons = document.querySelectorAll("[data-filter]");
  var cards = document.querySelectorAll(".event[data-state]");
  var emptyNote = document.getElementById("no-open-events");

  function apply(filter) {
    var shown = 0;
    cards.forEach(function (card) {
      card.hidden = filter === "open" && card.dataset.state !== "open";
      if (!card.hidden) shown += 1;
    });
    emptyNote.hidden = shown > 0;
    buttons.forEach(function (button) {
      var active = button.dataset.filter === filter;
      button.classList.toggle("on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () { apply(button.dataset.filter); });
  });
})();
