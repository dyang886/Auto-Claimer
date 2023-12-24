let campaigns;
let isClaimEnabled = true;
let allowClaimObserver;

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
  // home button after displaying campaigns
  document.getElementById("permaHome").addEventListener("click", function () {
    window.location.href = "../index.html";
  });

  // add game from open campaigns to selected
  document
    .getElementById("openCampaigns")
    .addEventListener("click", function (event) {
      if (event.target.classList.contains("gameSelection")) {
        const gameName = event.target.textContent;
        addSelected(gameName);
        saveSelected();
      }
    });

  // remove from selected campaigns if xmark is clicked
  // display rewards if right arrow is clicked
  document
    .getElementById("selectedCampaigns")
    .addEventListener("click", function (event) {
      if (event.target.classList.contains("fa-xmark")) {
        event.target.closest(".gameSelection").remove();
        saveSelected();
      } else if (
        event.target.classList.contains("fa-arrow-right") &&
        isClaimEnabled
      ) {
        const gameName = event.target
          .closest(".gameSelection")
          .textContent.trim();
        displayRewards(gameName);
      }
    });

  document
    .getElementById("rewardsOverlay")
    .addEventListener("click", function (event) {
      if (event.target === this) {
        this.style.display = "none";
      }
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
    window.api.send("open-twitch-windows");
    window.api.send("twitch-claim");
  }
});

window.api.receive("display-campaigns", (twitchList, load) => {
  if (load) {
    hideLoader();
    loadSelected();
    document.getElementById("campaigns").style.display = "flex";
    document.getElementById("permaHome").style.display = "block";
  }
  campaigns = twitchList;
  const gameNames = twitchList.map((game) => game.GameName);
  const openCampaigns = document.getElementById("openCampaigns");
  openCampaigns.innerHTML = ``;
  gameNames.forEach((gameName) => {
    openCampaigns.innerHTML += `<div class="gameSelection">${gameName}</div>`;
  });
});

// add game to selected campaigns
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
  newGameDiv.innerHTML = `
    ${gameName}
    <i class="fa-solid fa-xmark"></i>
    <i class="fa-solid fa-arrow-right"></i>
  `;
  selectedDiv.appendChild(newGameDiv);
}

// save all selected campaigns to settings.json
function saveSelected() {
  const selectedDiv = document.getElementById("selectedCampaigns");
  const games = Array.from(
    selectedDiv.getElementsByClassName("gameSelection")
  ).map((div) => div.textContent.trim());

  window.api.send("save-settings", "twitchSelectedGames", games);
}

// load twitchSelectedGames from settings.json
function loadSelected() {
  window.api.send("load-settings", "twitchSelectedGames");
}

// add each game from twitchSelectedGames in settings.json to selected campaigns
window.api.receive("settings-value", (games) => {
  if (games) {
    games.forEach((gameName) => {
      addSelected(gameName);
    });
  }
});

// display rewards overlay when right arrow is clicked
function displayRewards(gameName) {
  const game = campaigns.find((g) => g.GameName === gameName);
  const rewardsDiv = document.getElementById("rewardsList");
  rewardsDiv.innerHTML = "";

  if (game) {
    game.RewardsList.forEach((reward) => {
      for (const [rewardName, rewardDetails] of Object.entries(reward)) {
        const rewardContainer = document.createElement("div");
        rewardContainer.classList.add("reward-container");

        // Reward Title
        const rewardTitle = document.createElement("h3");
        rewardTitle.textContent = rewardName;
        rewardContainer.appendChild(rewardTitle);

        // Items List
        const itemList = document.createElement("ul");
        rewardDetails.ItemList.forEach((item) => {
          const itemLi = document.createElement("li");
          itemLi.textContent = item;
          itemList.appendChild(itemLi);
        });
        rewardContainer.appendChild(itemList);

        // Claim Button
        const claimButton = document.createElement("button");
        claimButton.classList.add("defaultButton");
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-gift";
        claimButton.appendChild(icon);
        claimButton.appendChild(document.createTextNode("Claim"));

        claimButton.addEventListener("click", function () {
          insertTerminal(`Starting to claim ${rewardName} for ${gameName}`);
          disableClaim();
          document.getElementById("rewardsOverlay").style.display = "none";
          window.api.send("start-claim", gameName, rewardName);
        });
        rewardContainer.appendChild(claimButton);

        rewardsDiv.appendChild(rewardContainer);
      }
    });
    document.getElementById("rewardsOverlay").style.display = "flex";

  } else {
    rewardsDiv.innerHTML = `<strong>No rewards currently available.</strong>`;
    document.getElementById("rewardsOverlay").style.display = "flex";
  }
}

// disable right arrows for each game in selected campaigns
function disableClaim() {
  isClaimEnabled = false;
  document.querySelectorAll(".fa-arrow-right").forEach((rightArrow) => {
    rightArrow.style.cursor = "not-allowed";
  });
  allowClaimObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        document.querySelectorAll(".fa-arrow-right").forEach((rightArrow) => {
          rightArrow.style.cursor = "not-allowed";
        });
      }
    });
  });

  allowClaimObserver.observe(document.body, { childList: true, subtree: true });
}

function enableClaim() {
  isClaimEnabled = true;
  document.querySelectorAll(".fa-arrow-right").forEach((rightArrow) => {
    rightArrow.style.cursor = "pointer";
  });
  if (allowClaimObserver) {
    allowClaimObserver.disconnect();
  }
}

// update claim progress
window.api.receive(
  "reward-status",
  (status, percentage, minutes, gameName, rewardName) => {
    if (status === "enableClaim") {
      enableClaim();
    } else if (status === "update") {
      document.getElementById("campaignProgress").style.display = "flex";
      document.getElementById("progressTitle").textContent = gameName;
      document.getElementById("rewardTitle").textContent = rewardName;
      setProgress(percentage);

      if (minutes) {
        let timeDisplay;
        if (minutes < 60) {
          timeDisplay = `${minutes} minutes`;
        } else {
          let hours = Math.floor(minutes / 60);
          let remainingMinutes = minutes % 60;
          timeDisplay =
            `${hours} hour${hours > 1 ? "s" : ""}` +
            (remainingMinutes > 0 ? ` ${remainingMinutes} minutes` : "");
        }
        document.getElementById("duration").textContent = timeDisplay;
      }
    }
  }
);

function setProgress(percentage) {
  // The percentage is between 0 and 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const progressBar = document.getElementById("progressValue");
  const progressPercentage = document.getElementById("percentage");

  progressBar.style.width = clampedPercentage + "%";
  progressPercentage.textContent = clampedPercentage + "%";
}
