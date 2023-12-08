const { screen, app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor;
  const scaledDimensions = primaryDisplay.size;

  const actualWidth = scaledDimensions.width * scaleFactor;
  const actualHeight = scaledDimensions.height * scaleFactor;

  const win = new BrowserWindow({
    width: actualWidth * 0.25,
    height: actualHeight * 0.3,
    icon: path.join(__dirname, "assets/logo.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("index.html");
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on('check-session', async (event, serviceUrl, cookieName) => {
  const cookies = await session.defaultSession.cookies.get({ url: serviceUrl });
  const isCookiePresent = cookies.some(cookie => cookie.name === cookieName);

  if (!isCookiePresent) {
    console.log("No session cookie found, open the login window");
    createLoginWindow(serviceUrl);
  } else {
    console.log("Session cookie found, send a message back to the renderer");
    event.reply('session-status', true);
  }
});

function createLoginWindow(serviceUrl) {
  const loginWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      nodeIntegration: false, // It's a security best practice to keep nodeIntegration off
      contextIsolation: true, // Protect against prototype pollution
      enableRemoteModule: false, // Turn off remote
      sandbox: true // Enable sandbox for security
    }
  });

  loginWindow.loadURL(serviceUrl);

  // This event will be triggered when the login process sets cookies
  loginWindow.webContents.session.cookies.on('changed', (event, cookie, cause, removed) => {
    if (!removed && cookie.domain.includes('amazon.com')) {
      // Here you can handle the session persistence logic if needed
      // By default, Electron will persist cookies in the session unless specified otherwise
      console.log("successfully found cookie");
      loginWindow.destroy();
    }
  });

  // Optional: Open the DevTools.
  // loginWindow.webContents.openDevTools();
}