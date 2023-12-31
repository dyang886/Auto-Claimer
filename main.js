const {
  screen,
  app,
  BrowserWindow,
  ipcMain,
  session,
  powerSaveBlocker,
  Notification,
} = require("electron");

const fs = require("fs");
const path = require("path");

let win;

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const dimensions = primaryDisplay.size;

  win = new BrowserWindow({
    width: dimensions.width * 0.4,
    height: dimensions.height * 0.5,
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
// Settings module
// ======================================================================
ipcMain.on("save-settings", async (event, key, value) => {
  const userDataPath = app.getPath("userData");
  const settingsPath = path.join(
    userDataPath,
    "AutoClaimer Settings",
    "settings.json"
  );

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  fs.readFile(settingsPath, (readErr, data) => {
    let settings = {};

    if (!readErr) {
      settings = JSON.parse(data);
    }
    settings[key] = value;

    fs.writeFile(settingsPath, JSON.stringify(settings), (writeErr) => {
      if (writeErr) {
        console.error("Error saving settings:", writeErr);
      } else {
        console.log("Settings updated successfully");
      }
    });
  });
});

ipcMain.on("load-settings", (event, key) => {
  const userDataPath = app.getPath("userData");
  const settingsPath = path.join(
    userDataPath,
    "AutoClaimer Settings",
    "settings.json"
  );

  fs.readFile(settingsPath, (err, data) => {
    if (err) {
      console.error("Error loading settings:", err);
      event.reply("settings-value", null);
    } else {
      const settings = JSON.parse(data);
      const value = settings[key];
      event.reply("settings-value", value);
    }
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
    { url: "https://accounts.nintendo.com", cookieName: "NAOPBS" },
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
        openLoginWindow(loginUrl);
      } else {
        ipcMainEvent.reply("session-status", false);
      }
    });
  }

  // Twitch
  else if (serviceUrl.includes("twitch.tv")) {
    openLoginWindow("https://www.twitch.tv/login");
  }

  // Nintendo
  else if (serviceUrl.includes("nintendo.com")) {
    openLoginWindow("https://accounts.nintendo.com/login");
  }
}

// Open login window and listen for login status changes
function openLoginWindow(loginUrl) {
  const loginWindow = new BrowserWindow({
    width: 500,
    height: 600,
    icon: path.join(__dirname, "assets/logo.ico"),
    show: false,
  });

  loginWindow.loadURL(loginUrl);
  let isLoginWindowDestroyedProgrammatically = false;
  let loginHandled = false;

  loginWindow.webContents.once("did-finish-load", () => {
    loginWindow.show();
    loginWindow.webContents.reload();
    win.webContents.send("message-from-main", "Login window opened.");

    // Delete twitch login privacy window
    if (loginUrl.includes("twitch.tv")) {
      loginWindow.webContents.executeJavaScript(`
        const observer = new MutationObserver(mutations => {
          for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
              const privacy = document.querySelector('div.kclbMN.consent-banner');
              if (privacy) {
                privacy.remove();
              }
            }
          }
        });
    
        observer.observe(document.body, { childList: true, subtree: true });
      `);
    }

    // Center nintendo login window
    if (loginUrl.includes("nintendo.com")) {
      loginWindow.webContents.executeJavaScript(`
        const htmlElement = document.documentElement;
        htmlElement.style.display = 'flex';
        htmlElement.style.justifyContent = 'center';
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

        // Nintendo
        else if (
          cookie.domain.includes("nintendo.com") &&
          cookie.name === "NAOPBS"
        ) {
          console.log("Nintendo cookie found, login successful.");
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

  amazonWindow.webContents.once("did-finish-load", () => {
    console.log("Finished loading amazon home page.");
    amazonWindow.webContents.reload();

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
        // console.log(result);
        console.log("Retrieved Amazon rewards list.");
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
let streamWindow = null; // display an active streamer streaming the target game
let statusWindow = null; // display the twitch inventory page to check and update reward progress
let currentCampaigns = []; // list of onGoing rewardName
let psBlocker; // prevent machine from sleeping during claiming

// open the two windows after successful login
ipcMain.on("open-twitch-windows", async (event) => {
  if (!statusWindow) {
    statusWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
    });
    statusWindow.loadURL("https://www.twitch.tv/drops/inventory");
  }

  if (!streamWindow) {
    streamWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
    });
  }
});

// display the campaign selection blocks, run once after successful login
ipcMain.on("twitch-claim", async (event) => {
  win.webContents.send(
    "message-from-main",
    "Retrieving list of open campaigns..."
  );
  const twitchList = await getTwitchCampaigns();

  if (twitchList) {
    win.webContents.send(
      "message-from-main",
      "Please select games that you want to claim."
    );
    win.webContents.send(
      "message-from-main",
      "Your selections will be saved for future sessions."
    );
    win.webContents.send("message-from-main", "hideLoader");
    win.webContents.send("display-campaigns", twitchList, true);
  } else {
    win.webContents.send(
      "message-from-main",
      "Error retrieving list of campaigns.",
      "error"
    );
  }
});

// return a result object as specified below
async function getTwitchCampaigns() {
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
  return new Promise((resolve) => {
    let twitchWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
    });

    twitchWindow.loadURL("https://www.twitch.tv/drops/campaigns");

    twitchWindow.webContents.once("did-finish-load", async () => {
      console.log("Finished loading Twitch campaigns.");
      twitchWindow.webContents.reload();

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
                      
                      // <li> contains item names and streamer links
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
        console.log("Retrieved Twitch campaign list.");
        twitchWindow.close();
        // console.log(JSON.stringify(result));
        resolve(result);
      } catch (error) {
        console.error("JavaScript execution failed:", error);
        twitchWindow.close();
        resolve(null);
      }
    });
  });
}

ipcMain.on("start-claim", async (event, gameName, rewardName) => {
  startClaim(gameName, rewardName);
});

// start claiming process after the button from rewards overlay is clicked
async function startClaim(gameName, rewardName) {
  win.webContents.send(
    "message-from-main",
    "Validating reward availability..."
  );
  const twitchList = await getTwitchCampaigns();

  if (twitchList) {
    // refresh open campaigns
    win.webContents.send("display-campaigns", twitchList, false);
    const selectedGame = twitchList.find((game) => game.GameName === gameName);

    if (selectedGame) {
      const selectedReward = selectedGame.RewardsList.find(
        (reward) => Object.keys(reward)[0] === rewardName
      );

      if (selectedReward) {
        const streamLinks = selectedReward[rewardName].StreamList;
        const targetLink = await getValidStreamLink(streamLinks);

        if (targetLink) {
          console.log("Active streamer: " + targetLink);
          win.webContents.send(
            "message-from-main",
            "Found available streamer, started claiming..."
          );

          // the newest rewardName is set as an attribute for streamWindow so that old rewards will be terminated
          if (streamWindow.rewardName !== rewardName) {
            streamWindow.rewardName = rewardName;
          } else {
            win.webContents.send(
              "reward-status",
              "enableClaim",
              null,
              null,
              null,
              null
            );
            win.webContents.send(
              "message-from-main",
              `Claiming already in progress: ${rewardName}`,
              "error"
            );
            return;
          }
          // prevent duplicate claims
          if (!currentCampaigns.includes(rewardName)) {
            currentCampaigns.push(rewardName);
          } else {
            win.webContents.send(
              "reward-status",
              "enableClaim",
              null,
              null,
              null,
              null
            );
            win.webContents.send(
              "message-from-main",
              `Claiming already in progress: ${rewardName}`,
              "error"
            );
            return;
          }
          console.log("\nCurrent campaigns:", currentCampaigns);

          streamWindow.loadURL(targetLink);
          streamWindow.webContents.setAudioMuted(true);
          streamWindow.webContents.once("did-finish-load", async () => {
            streamWindow.webContents.reload();
            psBlocker = powerSaveBlocker.start("prevent-app-suspension");
            console.log(
              powerSaveBlocker.isStarted(psBlocker)
                ? "Power Save Blocker is active."
                : "Power Save Blocker is inactive."
            );

            // start claiming loop
            const result = await updateRewardStatus(gameName, rewardName);
            if (result === "success") {
              win.webContents.send(
                "message-from-main",
                `Successfully claimed all items for ${rewardName}.`,
                "success"
              );
            } else {
              win.webContents.send(
                "message-from-main",
                `Claiming terminated for ${rewardName}: ${result}`,
                "error"
              );
            }
          });
        } else {
          win.webContents.send(
            "message-from-main",
            `No active streamers found for ${rewardName}.`,
            "error"
          );
        }
      } else {
        win.webContents.send(
          "message-from-main",
          `No rewards found for ${rewardName}.`,
          "error"
        );
      }
    } else {
      win.webContents.send(
        "message-from-main",
        `${gameName} currently has no open campaigns.`,
        "error"
      );
    }
  } else {
    win.webContents.send(
      "message-from-main",
      "Error retrieving list of campaigns.",
      "error"
    );
  }
  win.webContents.send("reward-status", "enableClaim", null, null, null, null);
}

// get an active streamer link if available
async function getValidStreamLink(streamLinks) {
  for (const linkInfo of streamLinks) {
    const link = linkInfo.more || linkInfo;
    const result = await checkStreamStatus(link, !!linkInfo.more);
    if (result && result !== "continue" && result !== "error") {
      return result;
    }
    console.log(
      result === "continue"
        ? `Streamer unavailable: ${link}`
        : `Error checking streamer status: ${link}`
    );
  }
  return "";
}

async function checkStreamStatus(link, isMoreCase) {
  let checkStreamWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
  });

  return new Promise((resolve) => {
    checkStreamWindow.loadURL(link);
    checkStreamWindow.webContents.setAudioMuted(true);

    checkStreamWindow.webContents.once("did-finish-load", async () => {
      checkStreamWindow.webContents.reload();

      try {
        const result = await checkStreamWindow.webContents.executeJavaScript(`
          new Promise(resolve => {
            const observer = new MutationObserver(mutations => {
              for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                  if (${isMoreCase}) {
                    const joinStreamButton = document.querySelector('a.ScCoreButton-sc-ocjdkq-0.ScCoreButtonPrimary-sc-ocjdkq-1');
                    const noResultsFound = [...document.querySelectorAll('h3.tw-title')].find(h3 => h3.textContent.trim() === "No results found");
                    if (joinStreamButton) {
                      observer.disconnect();
                      resolve(joinStreamButton.href); // Return the href of the join stream button
                    } else if (noResultsFound) {
                      observer.disconnect();
                      resolve('continue'); // No results found, continue to the next link
                    }
                  } else {
                    const offlineIndicator = document.querySelector('div.home-offline-hero');
                    const liveTimeIndicator = document.querySelector('span.live-time');
                    if (offlineIndicator) {
                      observer.disconnect();
                      resolve('continue'); // Stream is offline, continue to the next link
                    } else if (liveTimeIndicator) {
                      observer.disconnect();
                      resolve(\`${link}\`); // Stream is live, return the link
                    }
                  }
                }
              }
            });

            observer.observe(document.body, { childList: true, subtree: true });
          })
        `);
        checkStreamWindow.close();
        resolve(result);
      } catch (error) {
        console.error("JavaScript execution failed:", error);
        checkStreamWindow.close();
        resolve("error");
      }
    });
  });
}

// main claiming loop
async function updateRewardStatus(gameName, rewardName) {
  let success = false; // if the div with target rewardName disappears, meaning all items have been claimed
  let rewardAppears = null; // set to true if the target rewardName ever appears
  let loopCount = 0; // number of loops count
  let interval; // interval/loop object

  return new Promise((resolve, reject) => {
    const checkRewards = async () => {
      try {
        loopCount++;
        statusWindow.reload();

        // result = {
        //   rewardAvailable,  // if there's at least one ongoing progress shown
        //   longestMinute,    // longest minute among all reward items
        //   percentage,       // percentage for the item with longest minute
        //   claimed           // a list of item names claimed
        // }
        const result = await statusWindow.webContents.executeJavaScript(`
            new Promise((resolve) => {
              let mutationTimeout;
              const observer = new MutationObserver(() => {
                clearTimeout(mutationTimeout);
    
                mutationTimeout = setTimeout(() => {
                  observer.disconnect();
                  let rewardAvailable = false;
                  let longestMinute = -1;
                  let percentage = -1;
                  let claimed = [];

                  const onGoingRewards = document.querySelectorAll('.Layout-sc-1xcs6mc-0.ilRKfU');
                  onGoingRewards.forEach((rewardBlock) => {
                    let rewardDiv = Array.from(rewardBlock.querySelectorAll('a.tw-link')).some(anchor => anchor.textContent.trim() === "${rewardName}");
                    if (rewardDiv) {
                      rewardAvailable = true;
                      const items = rewardBlock.querySelectorAll('.Layout-sc-1xcs6mc-0.kBihNt');
                      items.forEach((item) => {
                        const progressBar = item.querySelector('.Layout-sc-1xcs6mc-0.iHJIAl');
                        if (progressBar) {
                          let pContent = progressBar.querySelector('.CoreText-sc-1txzju1-0').textContent.trim();
                          let parts = pContent.split(' ');
                          let pPercent = parseInt(parts[0], 10);
                          let timeInMinutes = 0;

                          for (let i = 1; i < parts.length; i++) {
                              if (parts[i].startsWith('hour')) {
                                  timeInMinutes += parseInt(parts[i - 1], 10) * 60; // Convert hours to minutes
                              } else if (parts[i].startsWith('min')) {
                                  timeInMinutes += parseInt(parts[i - 1], 10); // Already minutes
                              }
                          }

                          if (timeInMinutes > longestMinute) {
                              longestMinute = timeInMinutes;
                              percentage = pPercent;
                          }
                        }

                        const itemName = item.querySelector('p.CoreText-sc-1txzju1-0.jfZuWl').textContent;
                        const claimButton = item.querySelector('button div[data-a-target="tw-core-button-label-text"]');
                        if (claimButton) {
                          claimed.push(itemName);
                          claimButton.click();
                        }
                      });
                    }
                  });

                  if (longestMinute === -1 || percentage === -1) {
                    rewardAvailable = false;
                  }
                  resolve({ rewardAvailable, longestMinute, percentage, claimed });
                }, 1000);
              });
        
              observer.observe(document.body, { childList: true, subtree: true });
            });
          `);

        console.log(`\n${gameName}: ${rewardName}`);
        console.log(result);

        // if reward is available and rewardAppears is null, set it to true, rewardAppears will then always be true unless streamer offline
        if (
          rewardAppears === null &&
          (result.rewardAvailable || result.claimed.length !== 0)
        ) {
          rewardAppears = true;
        }

        // if reward ever appears but then disappears, then it means all items have been claimed
        if (rewardAppears) {
          success = await statusWindow.webContents.executeJavaScript(`
            new Promise((resolve) => {
              const rewardExists = Array.from(document.querySelectorAll('a.tw-link')).some(anchor => anchor.textContent.trim() === "${rewardName}");
              resolve(!rewardExists);
            });
          `);
        }

        const offline = await streamWindow.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const offlineElement = document.querySelector('.follow-panel-overlay');
            resolve(!!offlineElement);
          });
        `);
        // if streamer offline, set rewardAppears to null in order to activate unavailable case
        if (offline) {
          rewardAppears = null;
        }

        // End: new claiming in progress
        if (streamWindow.rewardName !== rewardName) {
          clearInterval(interval);
          endofClaim(rewardName);
          resolve("A new reward claiming is in progress.");
          return;
        }

        // display updates and claimed items if reward is available
        if (result.rewardAvailable) {
          win.webContents.send(
            "reward-status",
            "update",
            result.percentage,
            result.longestMinute,
            gameName,
            rewardName
          );
        }
        if (result.claimed) {
          result.claimed.forEach((itemName) => {
            win.webContents.send(
              "message-from-main",
              `Successfully claimed ${itemName}.`,
              "success"
            );
          });
        }

        // End: success case
        if (success && rewardAppears) {
          clearInterval(interval);
          streamWindow.rewardName = null;
          win.webContents.send(
            "reward-status",
            "update",
            100,
            null,
            gameName,
            rewardName
          );

          let notification = new Notification({
            title: "All items claimed!",
            body: `Successfully claimed ${rewardName} for ${gameName}.`,
            icon: path.join(__dirname, "assets/logo.png"),
          });
          notification.show();
          endofClaim(rewardName);
          resolve("success");
          return;

          // End: unavailable case
        } else if ((!result.rewardAvailable || offline) && !rewardAppears) {
          // loopCount > 2 (1.5 minutes) is to ensure twitch inventory page displays new rewards
          if (loopCount > 2) {
            clearInterval(interval);
            endofClaim(rewardName);
            if (!result.rewardAvailable) {
              resolve("Reward is already claimed or closed.");
            } else if (offline) {
              startClaim(gameName, rewardName);
              resolve("Streamer went offline, finding a new one...");
            }
            return;
          }
        }
      } catch (error) {
        clearInterval(interval);
        console.error("Error updating reward progress:", error);
        endofClaim(rewardName);
        return;
      }
    };

    interval = setInterval(checkRewards, 90000);
    checkRewards();
  });
}

// end power blocker and close stream if no ongoing campaigns
function endofClaim(rewardName) {
  currentCampaigns = currentCampaigns.filter((item) => item !== rewardName);
  console.log("\nCurrent campaigns:", currentCampaigns);
  if (currentCampaigns.length === 0) {
    powerSaveBlocker.stop(psBlocker);
    console.log(
      powerSaveBlocker.isStarted(psBlocker)
        ? "Power Save Blocker is active."
        : "Power Save Blocker is inactive."
    );
    streamWindow.loadURL("about:blank");
  }
}

// ======================================================================
// Nintendo claim process
// ======================================================================
ipcMain.on("nintendo-claim", async (event) => {
  let nintendoWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
  });

  nintendoWindow.loadURL("https://my.nintendo.com");
  win.webContents.send(
    "message-from-main",
    "Starting to claim platinum points..."
  );

  nintendoWindow.webContents.once("did-finish-load", () => {
    console.log("Finished loading My Nintendo page.");
    nintendoWindow.webContents.reload();

    // Claim weekly sign-in bonus (30)
    nintendoWindow.webContents
      .executeJavaScript(
        `
        new Promise((resolve, reject) => {
          let totalPoints;

          // click the signIn button if it appears
          setTimeout(() => {
            const signInButton = document.querySelector("button.signInButton");
            if (signInButton) {
              signInButton.click();
            }
            setupPointsObserver();
          }, 3000);
                
          function setupPointsObserver() {
            // click the mii character to claim points
            const miiLink = document.querySelector("a.mii");
            if (miiLink) {
              miiLink.click();
            }
        
            // get the points value
            const pointsObserver = new MutationObserver((mutations, obs) => {
              totalPoints = document.querySelector(".PointDetailCategory_item-platinum .value").textContent;
              const pointsOverlay = document.querySelector("ul.GiftItem_points");
              if (pointsOverlay) {
                clearTimeout(pointsTimeout);
                const pointsValue = document.querySelector("ul.GiftItem_points span.value").textContent;
                obs.disconnect();
                resolve({totalPoints: totalPoints, claimedPoints: pointsValue});
              }
            });
        
            pointsObserver.observe(document.body, { childList: true, subtree: true });
            pointsTimeout = setTimeout(() => {
              totalPoints = document.querySelector(".PointDetailCategory_item-platinum .value").textContent;
              pointsObserver.disconnect();
              resolve({totalPoints: totalPoints, claimedPoints: '0'});
            }, 3000);
          }
        });
      `
      )
      .then((result) => {
        let claimedPoints = result.claimedPoints.trim();
        let totalPoints = result.totalPoints.trim();
        console.log("Weekly sign-in bonus claimed: ", claimedPoints, "\nTotal points: ", totalPoints);
        if (claimedPoints === "0") {
          win.webContents.send("message-from-main", "My Nintendo weekly sign-in bonus is not available.", "error");
          win.webContents.send("platinum-points", claimedPoints, totalPoints, "true");
        } else {
          win.webContents.send("message-from-main", "Collected My Nintendo weekly sign-in bonus.", "success");
          win.webContents.send("platinum-points", claimedPoints, totalPoints, "true");
        }
        win.webContents.send("message-from-main", "hideLoader");

        // Claim all in earn points page
        nintendoWindow.loadURL("https://my.nintendo.com/missions");
        win.webContents.send(
          "message-from-main",
          "Checking Earn Points page..."
        );

        nintendoWindow.webContents.once("did-finish-load", () => {
          console.log("Finished loading Earn Points page.");
      
          // Click the collect all now button
          nintendoWindow.webContents
            .executeJavaScript(
              `
              new Promise(resolve => {
                setTimeout(() => {
                  const activeButton = document.querySelector('.btn-primary.MissionBulkReceive_button');
                  const inactiveButton = document.querySelector('.btn-disabled.MissionBulkReceive_button');

                  if (activeButton) {
                    activeButton.click();
                    setTimeout(() => {
                      getPoints();
                    }, 3000);
                  } else if (inactiveButton) {
                    getPoints();
                  }

                  function getPoints() {
                    let pointsValue = '0';
                    const totalPoints = document.querySelector('.CurrentPoints_item-platinum .value').textContent;
                    const claimedDiv = document.querySelector('ul.MissionBulkModal_pointList');
                    const claimedDivParent = claimedDiv.closest('div.Modal');
                    const claimed = window.getComputedStyle(claimedDivParent).display !== 'none';
                    if (claimed) {
                      pointsValue = claimedDiv.querySelector('.point .value').textContent;
                    }

                    resolve({totalPoints: totalPoints, claimedPoints: pointsValue});
                  }
                }, 3000);
              })
            `
            )
            .then((result2) => {
              claimedPoints = result2.claimedPoints.trim();
              totalPoints = result2.totalPoints.trim();
              console.log("Earn points page claimed: ", claimedPoints, "\nTotal points: ", totalPoints);
              if (claimedPoints === "0") {
                win.webContents.send("message-from-main", "No points to claim from missions.", "error");
                win.webContents.send("platinum-points", claimedPoints, totalPoints, "true");
              } else {
                win.webContents.send("message-from-main", "Collected all points from completed missions.", "success");
                win.webContents.send("platinum-points", claimedPoints, totalPoints, "true");
              }

              nintendoWindow.close();
              setTimeout(() => {
                win.webContents.send("platinum-points", null, null, "finish");
              }, 3000);
            });
        });
      })
      .catch((error) => {
        console.error("JavaScript execution failed:", error);
        win.webContents.send(
          "message-from-main",
          "Error claiming platinum points.",
          "error"
        );
        return;
      });
  });
});
