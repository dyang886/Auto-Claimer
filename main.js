const { screen, app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");

let win;

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor;
  const scaledDimensions = primaryDisplay.size;

  const actualWidth = scaledDimensions.width * scaleFactor;
  const actualHeight = scaledDimensions.height * scaleFactor;

  win = new BrowserWindow({
    width: actualWidth * 0.25,
    height: actualHeight * 0.3,
    icon: path.join(__dirname, "assets/logo.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("index.html");

  win.on("closed", () => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win) {
        window.close();
      }
    });
    app.quit();
  });
};

app.whenReady().then(() => {
  createWindow();
  setTimeout(() => {
    win.webContents.send("message-from-main", "Welcome!");
  }, 500);
  // clearAmazonCookie();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Check if login session exists
ipcMain.on("check-session", async (event, serviceUrl, cookieName) => {
  const cookies = await session.defaultSession.cookies.get({ url: serviceUrl });
  const isCookiePresent = cookies.some((cookie) => cookie.name === cookieName);

  if (!isCookiePresent) {
    win.webContents.send(
      "message-from-main",
      "Login credentials not found, opening the login window..."
    );
    ipcMainEvent = event;
    createLoginWindow(serviceUrl);
  } else {
    event.reply("session-status", true);
  }
});

// Create login window with login url
function createLoginWindow(serviceUrl) {
  if (serviceUrl.includes("amazon.com")) {
    getAmazonLoginUrl(serviceUrl, (loginUrl) => {
      if (loginUrl) {
        win.webContents.send(
          "message-from-main",
          "Login window opened, please wait for the page to load..."
        );
        openLoginWindow(loginUrl);
      } else {
        ipcMainEvent.reply("session-status", false);
      }
    });
  } else {
    // Other platforms
  }
}

// Open login window and listen for login status changes
function openLoginWindow(loginUrl) {
  const loginWindow = new BrowserWindow({
    width: 500,
    height: 600,
  });

  loginWindow.loadURL(loginUrl);

  let isLoginWindowDestroyedProgrammatically = false;

  // Amazon
  loginWindow.webContents.session.cookies.on(
    "changed",
    (event, cookie, cause, removed) => {
      if (
        !removed &&
        cookie.domain.includes("amazon.com") &&
        cookie.name === "x-main" &&
        cookie.value
      ) {
        console.log("x-main cookie found, login successful.");
        isLoginWindowDestroyedProgrammatically = true;
        loginWindow.destroy();
        ipcMainEvent.reply("session-status", true);
        return;
      }
    }
  );

  loginWindow.on("closed", () => {
    if (!isLoginWindowDestroyedProgrammatically) {
      win.webContents.send(
        "message-from-main",
        "Login window closed by user",
        "error"
      );
      ipcMainEvent.reply("session-status", false);
    }
  });
}

// Get amazon login url
function getAmazonLoginUrl(serviceUrl, callback) {
  let tempWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
  });

  tempWindow.loadURL(serviceUrl);

  tempWindow.webContents.on("did-finish-load", () => {
    tempWindow.webContents
      .executeJavaScript(
        `
      setTimeout(() => {
        document.querySelector('[data-a-target="sign-in-button"]').click();
      }, 1000);
    `
      )
      .catch((error) => {
        console.error("JavaScript execution failed:", error);
        win.webContents.send(
          "message-from-main",
          "Error loading amazon login page.",
          "error"
        );
        callback(null);
        return;
      });
  });

  tempWindow.webContents.on("will-redirect", (event, url) => {
    if (url.includes("www.amazon.com/ap/signin")) {
      tempWindow.destroy();
      callback(url);
    }
  });
}

// Amazon claim process
ipcMain.on("amazon-claim", async (event) => {
  let amazonWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
  });

  amazonWindow.loadURL("https://gaming.amazon.com/home");
  win.webContents.send(
    "message-from-main",
    "Retrieving list of items to claim..."
  );

  amazonWindow.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      amazonWindow.webContents
        .executeJavaScript(
          `
          (function() {
            var result = {};
            var blocks = document.querySelectorAll('.tw-block');
            
            blocks.forEach(block => {
                var claimButton = block.querySelector('p[title="Claim"]');
                if (claimButton) {
                    var gameName = block.querySelector('p a[aria-label]')?.getAttribute('aria-label').trim();
                    var itemName = block.querySelector('.item-card-details__body__primary h3')?.textContent.trim();
                    var gameLink = block.querySelector('a[data-a-target="learn-more-card"]')?.href;
    
                    if (gameName && itemName && gameLink) {
                        result[gameName] = { 'ItemName': itemName, 'Link': gameLink };
                    }
                }
            });
    
            return result;
        })();
      `
        )
        .then((result) => {
          console.log(result);
          win.webContents.send("message-from-main", "Claiming in progress...");
          let claimWindow = new BrowserWindow({
            width: 1280,
            height: 720,
            // show: false,
          });
          claimNextItem(Object.keys(result), result, claimWindow);
        })
        .catch((error) => {
          console.error("JavaScript execution failed:", error);
          win.webContents.send(
            "message-from-main",
            "Error retrieving list of items to claim.",
            "error"
          );
          return;
        });
    }, 3000);
  });
});

function claimNextItem(game, claimList, claimWindow, index = 0) {
  if (index >= game.length) {
    claimWindow.close();
    return;
  }

  const gameName = game[index];
  const item = claimList[gameName];
  claimWindow.loadURL(item["Link"]);

  claimWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      claimWindow.webContents
        .executeJavaScript(
          `
          document.querySelector('[data-a-target="buy-box_call-to-action"]').click();
        `
        )
        .then(() => {
          setTimeout(() => {
            win.webContents.send("claiming", gameName, item["ItemName"], true);
            claimNextItem(game, claimList, claimWindow, index + 1);
          }, 2000);
        })
        .catch((error) => {
          console.error("JavaScript execution failed:", error);
          win.webContents.send(
            "message-from-main",
            "Error claiming rewards.",
            "error"
          );
          claimNextItem(game, claimList, claimWindow, index + 1);
        });
    }, 3000);
  });
}

// for testing purpose
function clearAmazonCookie() {
  const amazonDomain = "amazon.com"; // The domain for which to clear cookies

  session.defaultSession.cookies
    .get({})
    .then((cookies) => {
      cookies.forEach((cookie) => {
        if (cookie.domain.includes(amazonDomain)) {
          session.defaultSession.cookies
            .remove(`https://${cookie.domain}`, cookie.name)
            .then(() => {
              console.log(
                `Cleared cookie ${cookie.name} for domain ${cookie.domain}`
              );
            })
            .catch((error) => {
              console.error(`Error clearing cookie ${cookie.name}: ${error}`);
            });
        }
      });
    })
    .catch((error) => {
      console.error(`Error fetching cookies: ${error}`);
    });
}
