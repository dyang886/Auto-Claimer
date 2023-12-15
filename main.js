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

    if (process.platform !== "darwin") {
      app.quit();
    }
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ======================================================================
// Logout module
// ======================================================================
ipcMain.on("display-login", async (event) => {
  await checkLoginStatus(event);
});

ipcMain.on("logout", async (event, domain) => {
  await clearCookie(domain);
  await checkLoginStatus(event);
});

const checkLoginStatus = async (event) => {
  const services = [
    { url: "https://gaming.amazon.com/home", cookieName: "x-main" },
    { url: "https://www.twitch.tv/drops/campaigns", cookieName: "auth-token" },
  ];

  const results = {};
  for (const service of services) {
    const cookies = await session.defaultSession.cookies.get({
      url: service.url,
    });
    const isCookiePresent = cookies.some(
      (cookie) => cookie.name === service.cookieName
    );
    results[service.url] = isCookiePresent;
  }

  event.reply("login-status", results);
};

async function clearCookie(url) {
  try {
    const cookies = await session.defaultSession.cookies.get({ url });
    for (const cookie of cookies) {
      await session.defaultSession.cookies.remove(url, cookie.name);
      console.log(`Cleared cookie ${cookie.name} from ${url}`);
    }
  } catch (error) {
    console.error(`Error in clearCookie: ${error}`);
  }
}

// ======================================================================
// Login module
// ======================================================================
ipcMain.on("check-session", async (event, serviceUrl, cookieName) => {
  const cookies = await session.defaultSession.cookies.get({ url: serviceUrl });
  const isCookiePresent = cookies.some((cookie) => cookie.name === cookieName);

  if (!isCookiePresent) {
    win.webContents.send(
      "message-from-main",
      "Login credentials not found, opening the login window...",
      "error"
    );
    ipcMainEvent = event;
    createLoginWindow(serviceUrl);
  } else {
    event.reply("session-status", true);
  }
});

// Create login window with login url
function createLoginWindow(serviceUrl) {
  // Amazon
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

    // Twitch
  } else if (serviceUrl.includes("twitch.tv")) {
    win.webContents.send(
      "message-from-main",
      "Login window opened, please wait for the page to load..."
    );
    openLoginWindow("https://www.twitch.tv/login");
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
  let loginHandled = false;

  loginWindow.webContents.on("did-finish-load", () => {
    // Delete twitch login privacy window
    if (loginUrl.includes("twitch.tv")) {
      loginWindow.webContents.executeJavaScript(`
        setInterval(() => {
          const privacy = document.querySelector('div.Layout-sc-1xcs6mc-0.gUvyVO');
          if (privacy) {
            privacy.remove();
          }
        }, 500);
      `);
    }
  });

  loginWindow.webContents.session.cookies.on(
    "changed",
    (event, cookie, cause, removed) => {
      if (loginHandled) return;

      if (!removed && cookie.value) {
        // Amazon
        if (cookie.domain.includes("amazon.com") && cookie.name === "x-main") {
          console.log("Amazon cookie found, login successful.");
          loginHandled = true;
        }

        // Twitch
        else if (
          cookie.domain.includes("twitch.tv") &&
          cookie.name === "auth-token"
        ) {
          console.log("Twitch cookie found, login successful.");
          loginHandled = true;
        }

        if (loginHandled) {
          isLoginWindowDestroyedProgrammatically = true;
          loginWindow.destroy();
          ipcMainEvent.reply("session-status", true);
          return;
        }
      }
    }
  );

  loginWindow.once("close", () => {
    if (!isLoginWindowDestroyedProgrammatically) {
      win.webContents.send(
        "message-from-main",
        "Login window closed by user.",
        "error"
      );
      loginWindow.webContents.session.cookies.removeAllListeners("changed");
      ipcMainEvent.reply("session-status", false);
    }
    loginHandled = false;
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
        const observer = new MutationObserver((mutations, obs) => {
          const button = document.querySelector('[data-a-target="sign-in-button"]');
          if (button) {
            button.click();
            obs.disconnect();
          }
        });
      
        observer.observe(document.body, { childList: true, subtree: true });
      `
      )
      .catch((error) => {
        console.error("JavaScript execution failed:", error);
        win.webContents.send(
          "message-from-main",
          "Error loading amazon login page.",
          "error"
        );
        tempWindow.destroy();
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

// ======================================================================
// Amazon claim process
// ======================================================================
ipcMain.on("amazon-claim", async (event) => {
  let amazonWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
  });

  amazonWindow.loadURL("https://gaming.amazon.com/home");
  win.webContents.send(
    "message-from-main",
    "Retrieving list of items to claim..."
  );

  amazonWindow.webContents.on("did-finish-load", () => {
    // Find all .tw-block with a claim button
    amazonWindow.webContents
      .executeJavaScript(
        `
        new Promise((resolve, reject) => {
          let mutationTimeout;
          const observer = new MutationObserver(() => {
            clearTimeout(mutationTimeout);

            mutationTimeout = setTimeout(() => {
              const blocks = document.querySelectorAll('.tw-block');
              if (blocks.length > 0) {
                observer.disconnect();
    
                const result = {};
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
                resolve(result);
              }
            }, 1000);
          });
    
          observer.observe(document.body, { childList: true, subtree: true });
        })
      `
      )
      .then((result) => {
        console.log(result);
        win.webContents.send("message-from-main", "Claiming in progress...");
        win.webContents.send("message-from-main", "hideLoader");
        amazonWindow.close();
        let claimWindow = new BrowserWindow({
          width: 1280,
          height: 720,
          show: false,
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
  });
});

// Iterate and claim each amazon reward
function claimNextItem(game, claimList, claimWindow, index = 0) {
  if (index >= game.length) {
    claimWindow.close();
    win.webContents.send("claiming", null, null, "finish");
    return;
  }

  const gameName = game[index];
  const item = claimList[gameName];
  claimWindow.loadURL(item["Link"]);

  function navigateListener() {
    win.webContents.send(
      "message-from-main",
      `Successfully claimed items for ${gameName}.`,
      "success"
    );
    win.webContents.send("claiming", gameName, item["ItemName"], "true");
    setTimeout(() => {
      claimWindow.webContents.removeListener(
        "did-navigate-in-page",
        navigateListener
      );
      claimNextItem(game, claimList, claimWindow, index + 1);
    }, 2000);
  }

  claimWindow.webContents.once("did-finish-load", () => {
    claimWindow.webContents.on("did-navigate-in-page", navigateListener);
    claimWindow.webContents
      .executeJavaScript(
        `
        new Promise((resolve, reject) => {
          const observer = new MutationObserver((mutations) => {
            // Initial check for the claim button
            const claimButton = document.querySelector('button[data-a-target="buy-box_call-to-action"]');
            if (claimButton) {
              claimButton.click();
            }

            // Subsequent checks for modal and account linking buttons
            for (let mutation of mutations) {
              if (mutation.addedNodes.length) {
                if (document.querySelector('[data-a-target="LinkAccountModal"]')) {
                  const linkAccountButton = document.querySelector('button[data-a-target="LinkAccountButton"]');
                  const alreadyLinkedButton = document.querySelector('button[data-a-target="AlreadyLinkedAccountButton"]');

                  if (linkAccountButton && alreadyLinkedButton) {
                    alreadyLinkedButton.click();
                    observer.disconnect();

                  } else if (linkAccountButton) {
                    observer.disconnect();
                    resolve('failure');
                  }
                }
              }
            }
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true
          });

          setTimeout(() => {
            observer.disconnect();
            resolve('timeout');
          }, 7000);
        });
      `
      )
      .then((result) => {
        if (result === "failure") {
          win.webContents.send(
            "message-from-main",
            `Failed to claim items for ${gameName}, account linking required.`,
            "error"
          );
        } else if (result === "timeout") {
          win.webContents.send(
            "message-from-main",
            `Failed to claim items for ${gameName} due to timeout.`,
            "error"
          );
        }

        win.webContents.send("claiming", gameName, item["ItemName"], "false");
        setTimeout(() => {
          claimWindow.webContents.removeListener(
            "did-navigate-in-page",
            navigateListener
          );
          claimNextItem(game, claimList, claimWindow, index + 1);
        }, 2000);
      })
      .catch((error) => {
        console.error("JavaScript execution failed:", error);
        win.webContents.send(
          "message-from-main",
          `Failed to claim items for ${gameName} due to an error.`,
          "error"
        );
        win.webContents.send("claiming", gameName, item["ItemName"], "false");
        setTimeout(() => {
          claimWindow.webContents.removeListener(
            "did-navigate-in-page",
            navigateListener
          );
          claimNextItem(game, claimList, claimWindow, index + 1);
        }, 2000);
      });
  });
}

// ======================================================================
// Twitch claim process
// ======================================================================
ipcMain.on("twitch-claim", async (event) => {
  let twitchWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
  });

  twitchWindow.loadURL("https://www.twitch.tv/drops/campaigns");
  win.webContents.send(
    "message-from-main",
    "Retrieving list of open campaigns..."
  );

  twitchWindow.webContents.on("did-finish-load", async () => {
    const twitchList = await getTwitchCampaigns(twitchWindow);
    win.webContents.send(
      "message-from-main",
      "Please select games that you want to claim."
    );
    win.webContents.send(
      "message-from-main",
      "Your selection will be saved for future sessions."
    );
    win.webContents.send("message-from-main", "hideLoader");
    const gameNames = twitchList.map(game => game.GameName);
    win.webContents.send("display-campaigns", gameNames);
  });
});

async function getTwitchCampaigns(twitchWindow) {
  // result format:
  // result = [
  //   {
  //     GameName: gameName,
  //     RewardsList: [
  //       [rewardName]: {
  //         ItemList: [
  //           /* reward item name */
  //         ],
  //         StreamList: [
  //           /* streamer links */
  //         ],
  //       }
  //     ],
  //     Connected: isConnected
  //   }
  // ]
  try {
    const result = await twitchWindow.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        let mutationTimeout;
        const observer = new MutationObserver(() => {
          clearTimeout(mutationTimeout);

          mutationTimeout = setTimeout(() => {
            const dropDivs = document.querySelectorAll('.Layout-sc-1xcs6mc-0.ivrFkx + .Layout-sc-1xcs6mc-0');
            const container = Array.from(dropDivs).find(div => div.getAttribute('class') === 'Layout-sc-1xcs6mc-0');
            const gameDivs = container.querySelectorAll(':scope > .Layout-sc-1xcs6mc-0');
            if (gameDivs.length > 0) {
              observer.disconnect();
              let gamesList = [];

              // Loop through each game campaign
              gameDivs.forEach(gameDiv => {
                const gameName = gameDiv.querySelector('h3').textContent;
                const rewardsDiv = gameDiv.querySelector('.cRPebU > .Layout-sc-1xcs6mc-0') 
                                || gameDiv.querySelector('.dyXzMr > .Layout-sc-1xcs6mc-0');
                const rewardsChildren = rewardsDiv.querySelectorAll(':scope > .Layout-sc-1xcs6mc-0:not(.hmbWfq)');
                let rewardsList = [];

                // Loop through each reward for one campaign
                rewardsChildren.forEach(childDiv => {
                  const rewardName = childDiv.querySelector('p.CoreText-sc-1txzju1-0').textContent;
                  const itemStreamDiv = childDiv.querySelector('.tw-typeset');
                  const itemStreamElements = itemStreamDiv.querySelectorAll('li');
                  let itemsList = [];
                  let streamLinks = [];

                  itemStreamElements.forEach(li => {
                    const span = li.querySelector('span');
                    if (span) {
                      itemsList.push(span.textContent.trim());
                    }

                    const streams = li.querySelectorAll('a');
                    streams.forEach(a => {
                      const text = a.textContent.trim();
                      if (text.toLowerCase() === 'more' || text.toLowerCase() === 'a participating live channel') {
                        streamLinks.push({ 'more': a.href });
                      } else {
                        streamLinks.push(a.href);
                      }
                    });
                  });

                  rewardsList.push({
                    [rewardName]: {
                      ItemList: itemsList,
                      StreamList: streamLinks
                    }
                  });
                });

                const connectedSpan = gameDiv.querySelector('span.tw-pill');
                const isConnected = connectedSpan ? true : false;

                gamesList.push({
                  GameName: gameName,
                  RewardsList: rewardsList,
                  Connected: isConnected
                });
              });

              resolve(gamesList);
            }
          }, 1000);
        });

        observer.observe(document.body, { childList: true, subtree: true });
      })
    `);
    console.log("Retrieved twitch campaign list.");
    // const resultString = JSON.stringify(result, null, 2);
    // console.log(resultString);
    twitchWindow.close();
    return result;
  } catch (error) {
    console.error("JavaScript execution failed:", error);
    win.webContents.send(
      "message-from-main",
      "Error retrieving list of campaigns.",
      "error"
    );
  }
}
