(function () {
  "use strict";

  var SAME_CODE_WINDOW_MS = 3000;
  var RESULT_VISIBLE_MS = 2000;
  var BEEPS = {
    checked_in: { hz: 880, seconds: 0.15, times: 1 },
    already: { hz: 440, seconds: 0.4, times: 1 },
    invalid: { hz: 200, seconds: 0.4, times: 1 },
    not_accepted: { hz: 300, seconds: 0.12, times: 3 }
  };
  var BEEP_GAP_SECONDS = 0.08;
  var TITLES = {
    checked_in: "CHECKED IN",
    already: "ALREADY CHECKED IN",
    invalid: "INVALID TICKET",
    not_accepted: "NOT ACCEPTED"
  };
  var NOT_ACCEPTED_REASONS = { pending: "still under review", declined: "declined" };

  var panel = document.querySelector(".scanner");
  var card = document.getElementById("scan-result");
  var cardTitle = card.querySelector(".scan-result-title");
  var cardDetail = card.querySelector(".scan-result-detail");
  var form = document.getElementById("code-form");
  var input = document.getElementById("code-input");
  var cameraNote = document.getElementById("camera-note");

  var lastSeenAt = {};
  var waitingForReply = false;
  var showingResult = false;
  var audio = null;

  function seenJustNow(code) {
    var now = Date.now();
    var repeat = now - (lastSeenAt[code] || 0) < SAME_CODE_WINDOW_MS;
    lastSeenAt[code] = now;
    return repeat;
  }

  function beep(status) {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audio = audio || new AudioContext();
    var pattern = BEEPS[status];
    for (var played = 0; played < pattern.times; played += 1) {
      var startsAt = audio.currentTime + played * (pattern.seconds + BEEP_GAP_SECONDS);
      var tone = audio.createOscillator();
      var volume = audio.createGain();
      tone.frequency.value = pattern.hz;
      volume.gain.value = 0.2;
      tone.connect(volume).connect(audio.destination);
      tone.start(startsAt);
      tone.stop(startsAt + pattern.seconds);
    }
  }

  function detailFor(result) {
    if (result.status === "checked_in") return result.name + " (" + result.code + ")";
    if (result.status === "already") return result.name + " (" + result.code + ") at " + result.checked_in_at;
    if (result.status === "not_accepted") {
      return result.name + " (" + result.code + ") is " + NOT_ACCEPTED_REASONS[result.state];
    }
    return "This code does not match any registration";
  }

  function show(status, title, detail) {
    card.className = "scan-result status-" + status;
    cardTitle.textContent = title;
    cardDetail.textContent = detail;
  }

  function showReady() {
    showingResult = false;
    show("ready", "Ready to scan", "Waiting for a ticket");
  }

  function showResult(result) {
    showingResult = true;
    show(result.status, TITLES[result.status], detailFor(result));
    beep(result.status);
    setTimeout(showReady, RESULT_VISIBLE_MS);
  }

  function showProblem(message) {
    showingResult = true;
    show("invalid", "NOT SENT", message);
    setTimeout(showReady, RESULT_VISIBLE_MS);
  }

  function readReply(response) {
    if (response.status === 401) {
      window.location.assign("/staff/login?next=/scanner");
      throw new Error("Logged out");
    }
    if (!response.ok) throw new Error("The server refused the scan. Reload the page.");
    return response.json();
  }

  function submit(scanned) {
    var code = scanned.trim();
    if (!code || seenJustNow(code) || showingResult || waitingForReply) return;
    waitingForReply = true;
    fetch(panel.dataset.checkinUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": panel.dataset.csrfToken },
      body: JSON.stringify({ code: code })
    })
      .then(readReply)
      .then(showResult)
      .catch(function (error) { showProblem(error.message); })
      .finally(function () { waitingForReply = false; });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    submit(input.value);
    input.value = "";
  });

  if (window.matchMedia("(pointer: fine)").matches) {
    input.addEventListener("blur", function () {
      setTimeout(function () { input.focus(); }, 0);
    });
  }

  function cameraUnavailable() {
    document.getElementById("camera").hidden = true;
    cameraNote.hidden = false;
  }

  function scanArea(width, height) {
    var side = Math.floor(Math.min(width, height) * 0.8);
    return { width: side, height: side };
  }

  function startCamera() {
    if (!window.Html5Qrcode) {
      cameraUnavailable();
      return;
    }
    new Html5Qrcode("camera")
      .start({ facingMode: "environment" }, { fps: 10, qrbox: scanArea }, submit, function () {})
      .catch(cameraUnavailable);
  }

  window.addEventListener("load", startCamera);
})();
