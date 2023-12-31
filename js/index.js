window.addEventListener("DOMContentLoaded", () => {
  insertTerminal("Welcome to Auto Claimer, your all-in-one game rewards claimer!");

  document.getElementById("twitch").addEventListener("click", function () {
    window.location.href = "html/twitch.html";
  });

  document.getElementById("amazon").addEventListener("click", function () {
    window.location.href = "html/amazon.html";
  });

  document.getElementById("nintendo").addEventListener("click", function () {
    window.location.href = "html/nintendo.html";
  });

  document.getElementById("home").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  document.getElementById("unlinkButton").addEventListener("click", (event) => {
    event.target.style.display = "none";
    showHomeButton();
    document.getElementById("platforms").style.display = "none";
    window.api.send("display-login");
  });
});

window.api.receive("login-status", (status) => {
  const loginStatus = document.getElementById("loginStatus");
  loginStatus.innerHTML = "";

  Object.entries(status).forEach(([url, isLoggedIn]) => {
    let serviceName = "";
    let buttonId = "";

    if (url.includes("amazon.com")) {
      serviceName = "Amazon Prime Gaming";
      buttonId = "amazonLogout";
    } else if (url.includes("twitch.tv")) {
      serviceName = "Twitch";
      buttonId = "twitchLogout";
    } else if (url.includes("nintendo.com")) {
      serviceName = "Nintendo";
      buttonId = "nintendoLogout";
    }

    if (serviceName) {
      loginStatus.innerHTML += `
        <div class="account">
          <h3>${serviceName}: </h3>
          ${
            isLoggedIn
              ? `<button class="dangerButton" id="${buttonId}"><i class="fas fa-sign-out"></i>Log Out</button>`
              : `<h3 class="status"><i class="fas fa-user-slash"></i>Logged Out</h3>`
          }
        </div>`;

      setTimeout(() => {
        if (isLoggedIn) {
          const logoutButton = document.getElementById(buttonId);
          if (logoutButton) {
            logoutButton.addEventListener("click", () => {
              window.api.send("logout", url);
            });
          }
        }
      }, 0);
    }
  });
});
