window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("retryButton").addEventListener("click", (event) => {
    event.target.style.display = "none";
    showLoader();
    checkSession();
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
  } else {
    insertTerminal("Login session found!", "success");
    window.api.send("twitch-claim");
  }
});
