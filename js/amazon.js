window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("retryButton").addEventListener("click", (event) => {
    event.target.style.display = "none";
    checkSession();
  });

  checkSession();
});

window.api.receive("message-from-main", (message, type, typingSpeed) => {
  insertTerminal(message, type, typingSpeed);
});

function checkSession() {
  insertTerminal("Checking login status...");
  window.api.send("check-session", "https://gaming.amazon.com/home", "x-main");
}

window.api.receive("session-status", (isLoggedIn) => {
  if (!isLoggedIn) {
    showRetryButton();
  } else {
    insertTerminal("Login session found!", "success");
    document.getElementById(
      "onGoingClaim"
    ).innerHTML = `<h1>Claiming:</h1><div id="gameItem"></div>`;
    window.api.send("amazon-claim");
  }
});

window.api.receive("claiming", (gameName, itemName, status) => {
  const gameDiv = document.getElementById("gameItem");
  gameDiv.innerHTML = `<h1>${gameName}</h1><h2>${itemName}</h2>`;
});

function showRetryButton() {
  const retryButton = document.getElementById("retryButton");
  if (retryButton) {
    retryButton.style.display = "block";
  }
}
