window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("retryButton").addEventListener("click", (event) => {
    event.target.style.display = "none";
    showLoader();
    checkSession();
  });

  document.getElementById("home").addEventListener("click", function () {
    window.location.href = "../index.html";
  });

  checkSession();
});

function checkSession() {
  insertTerminal("Checking login status...");
  window.api.send("check-session", "https://www.twitch.tv/login", "auth-token");
}

window.api.receive("session-status", (isLoggedIn) => {
  if (!isLoggedIn) {
    hideLoader();
    showRetryButton();
    showHomeButton();
  } else {
    insertTerminal("Login session found!", "success");
    window.api.send("twitch-claim");
  }
});
