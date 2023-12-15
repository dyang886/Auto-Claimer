window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("retryButton").addEventListener("click", (event) => {
    event.target.style.display = "none";
    hideHomeButton();
    showLoader();
    checkSession();
  });

  document.getElementById("home").addEventListener("click", function () {
    window.location.href = "../index.html";
  });

  document
    .getElementById("openCampaigns")
    .addEventListener("click", function (event) {
      if (event.target.classList.contains("gameSelection")) {
        const gameName = event.target.textContent;
        addSelected(gameName);
      }
    });

  checkSession();
});

function addSelected(gameName) {
  const selectedDiv = document.getElementById("selectedCampaigns");

  const existingGames = selectedDiv.getElementsByClassName("gameSelection");
  for (let i = 0; i < existingGames.length; i++) {
    if (existingGames[i].textContent.includes(gameName)) {
      insertTerminal("Campaign already selected.", "error");
      return;
    }
  }

  const newGameDiv = document.createElement("div");
  newGameDiv.classList.add("gameSelection");
  newGameDiv.innerHTML = `${gameName}
                          <i class="fa-solid fa-xmark"></i>
                          <i class="fa-solid fa-arrow-right"></i>`;
  selectedDiv.appendChild(newGameDiv);
}

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

window.api.receive("display-campaigns", (gameNames) => {
  hideLoader();
  document.getElementById("campaigns").style.display = "flex";
  const openCampaigns = document.getElementById("openCampaigns");
  openCampaigns.innerHTML = ``;
  gameNames.forEach((gameName) => {
    openCampaigns.innerHTML += `<div class="gameSelection">${gameName}</div>`;
  });
});
