window.api.receive("message-from-main", (message, type, typingSpeed) => {
  if (message === "hideLoader") {
    hideLoader();
    return;
  }
  insertTerminal(message, type, typingSpeed);
});

function insertTerminal(message, type = "default", typingSpeed = 20) {
  const terminalWindow = document.getElementById("innerTerminalWindow");
  const messageSpan = document.createElement("div");

  switch (type) {
    case "success":
      messageSpan.classList.add("success-message");
      break;
    case "error":
      messageSpan.classList.add("error-message");
      break;
    default:
      break;
  }

  terminalWindow.appendChild(messageSpan);

  let i = 0;
  function typeWriter() {
    if (i < message.length) {
      messageSpan.textContent += message.charAt(i);
      i++;
      setTimeout(typeWriter, typingSpeed);
    } else {
      terminalWindow.scrollTop = terminalWindow.scrollHeight;
    }
  }

  typeWriter();
}

function showLoader() {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.display = "block";
  }
}

function hideLoader() {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.display = "none";
  }
}

function showRetryButton() {
  const retryButton = document.getElementById("retryButton");
  if (retryButton) {
    retryButton.style.display = "block";
  }
}
