(function () {
  "use strict";

  var form = document.getElementById("registration-form");
  if (!form) return;

  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var PHONE_RE = /^(?:09|\+639)\d{9}$/;

  var rules = {
    full_name: function (v) {
      if (!v) return "Full name is required.";
      if (v.length > 100) return "Full name must be at most 100 characters.";
      return "";
    },
    email: function (v) {
      if (!v) return "Email address is required.";
      if (v.length > 254) return "Email address must be at most 254 characters.";
      if (!EMAIL_RE.test(v)) return "Enter a valid email address, like name@example.com.";
      return "";
    },
    organization: function (v) {
      if (!v) return "Organization is required.";
      if (v.length > 150) return "Organization must be at most 150 characters.";
      return "";
    },
    contact_number: function (v) {
      if (!v) return "Contact number is required.";
      if (!PHONE_RE.test(v.replace(/[\s\-()]/g, ""))) {
        return "Enter a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX.";
      }
      return "";
    },
    consent: function (v) {
      return v ? "" : "Tick the box to agree before you continue.";
    }
  };

  function showError(input, message) {
    var box = document.getElementById(input.name + "-error");
    var wrapper = input.closest(".field");
    box.textContent = message;
    wrapper.classList.toggle("has-error", Boolean(message));
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function check(input) {
    var value = input.type === "checkbox" ? (input.checked ? "yes" : "") : input.value.trim();
    var message = rules[input.name](value);
    showError(input, message);
    return !message;
  }

  Object.keys(rules).forEach(function (name) {
    var input = form.elements[name];
    input.addEventListener(input.type === "checkbox" ? "change" : "blur", function () { check(input); });
    input.addEventListener("input", function () {
      if (input.closest(".field").classList.contains("has-error")) check(input);
    });
  });

  form.addEventListener("submit", function (event) {
    var firstBad = null;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      if (!check(input) && !firstBad) firstBad = input;
    });
    if (firstBad) {
      event.preventDefault();
      firstBad.focus();
    }
  });
})();
