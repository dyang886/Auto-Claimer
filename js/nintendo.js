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

  checkSession();
});

function checkSession() {
  insertTerminal("Checking login status...");
  window.api.send("check-session", "https://accounts.nintendo.com", "NAOPBS");
}

window.api.receive("session-status", (isLoggedIn) => {
  if (!isLoggedIn) {
    hideLoader();
    showRetryButton();
    showHomeButton();
  } else {
    insertTerminal("Login session found!", "success");
    window.api.send("nintendo-claim");
  }
});

window.api.receive("platinum-points", (claimedPoints, totalPoints, status) => {
  const statusDiv = document.getElementById("claimStatus");
  statusDiv.style.animation = "fadeInDown 0.5s";
  if (status === "true") {
    statusDiv.innerHTML = `
      <div class="pl-div">
        <img class="pl-points" src="../assets/pl-points.png" alt="Platinum Points">
        <i class="fas fa-plus"></i>
        <h2>${claimedPoints}</h2>
      </div>
      <h3>Total points: ${totalPoints}</h3>
    `;
  } else if (status === "finish") {
    insertTerminal("Claiming completed.");
    statusDiv.innerHTML = `<h1>All points claimed!</h1>`;
    showHomeButton();
  }
  setTimeout(() => {
    statusDiv.style.animation = "none";
  }, 510);
});
