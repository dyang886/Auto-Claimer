window.addEventListener("DOMContentLoaded", () => {
  // Generic session check that could be used for any site.
  window.api.send("check-session", "https://gaming.amazon.com/home", "x-main");
});

window.api.receive("session-status", (isLoggedIn) => {
  if (!isLoggedIn) {
    insertTerminal("Credentials not found!");
    window.api.send("open-login-window", "https://gaming.amazon.com/home");
  } else {
    insertTerminal("Amazon session is active.");
    // The user is logged in, proceed accordingly
  }
});
