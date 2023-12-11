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

  document.getElementById("back").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  document.getElementById("unlinkButton").addEventListener("click", (event) => {
    event.target.style.display = "none";
    document.getElementById("platforms").style.display = "none";
    document.getElementById("back").style.display = "block";
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
    }

    if (serviceName) {
      loginStatus.innerHTML += `
        <div>
          <h3>${serviceName}: </h3>
          ${
            isLoggedIn
              ? `<button class="dangerButton" id="${buttonId}">Log Out</button>`
              : "<h3>Logged Out</h3>"
          }
        </div>`;

      if (isLoggedIn) {
        const logoutButton = document.getElementById(buttonId);
        if (logoutButton) {
          logoutButton.addEventListener("click", () => {
            window.api.send("logout", url);
          });
        }
      }
    }
  });
});
