window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("twitch").addEventListener("click", function () {
    window.location.href = "html/twitch.html";
  });

  document.getElementById("amazon").addEventListener("click", function () {
    window.location.href = "html/amazon.html";
  });

  document.getElementById("nintendo").addEventListener("click", function () {
    window.location.href = "html/nintendo.html";
  });
});

window.api.receive('message-from-main', (message, type, typingSpeed) => {
  insertTerminal(message, type, typingSpeed);
});