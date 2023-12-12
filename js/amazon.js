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
  window.api.send("check-session", "https://gaming.amazon.com/home", "x-main");
}

window.api.receive("session-status", (isLoggedIn) => {
  if (!isLoggedIn) {
    hideLoader();
    showRetryButton();
    showHomeButton();
  } else {
    insertTerminal("Login session found!", "success");
    window.api.send("amazon-claim");
  }
});

window.api.receive("claiming", (gameName, itemName, status) => {
  const gameDiv = document.getElementById("onGoingClaim");
  gameDiv.style.animation = "fadeInDown 0.5s";
  gameDiv.innerHTML = `<p>Claiming:</p><h1>${gameName}</h1><hr><h2>${itemName}</h2>`;
  if (status === "true") {
    gameDiv.innerHTML += `<h3>Result: <span class="success-message">Success!</span></h3>`;
  } else if (status === "false") {
    gameDiv.innerHTML += `<h3>Result: <span class="error-message">Failed!</span></h3>`;
  } else if (status === "finish") {
    insertTerminal("Claiming completed.");
    gameDiv.innerHTML = `<h1>All items claimed!</h1>`;
    showHomeButton();
  }
  setTimeout(() => {
    gameDiv.style.animation = "none";
  }, 510);
});
