function insertTerminal(message, type = "default", typingSpeed = 20) {
  const terminalWindow = document.getElementById("terminalWindow");
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