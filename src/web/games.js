import { createStorage } from "./storage.js";

const gamesList = document.getElementById("games-list");
const newGameInput = document.getElementById("new-game-name");
const createGameButton = document.getElementById("create-game");
const statusEl = document.getElementById("status");
const connectButton = document.getElementById("connect-drive");
const disconnectButton = document.getElementById("disconnect-drive");

const setStatus = (message) => {
  statusEl.textContent = message;
};

let storage = null;

const syncAuthUi = () => {
  if (!storage) return;
  const signedIn = storage.isAuthorized();
  connectButton.hidden = signedIn;
  disconnectButton.hidden = !signedIn;
};

const renderGames = (games) => {
  gamesList.innerHTML = "";
  if (!games.length) {
    gamesList.innerHTML = "<p class=\"empty\">No games yet.</p>";
    return;
  }

  games.forEach((game) => {
    const link = document.createElement("a");
    link.className = "list-item";
    link.href = `game.html?game=${game.id}`;
    link.textContent = game.name;
    gamesList.appendChild(link);
  });
};

const loadGames = async () => {
  try {
    if (!storage) throw new Error("Storage not ready.");
    const games = await storage.listGames();
    renderGames(games);
  } catch (err) {
    setStatus(`Failed to load games: ${err.message}`);
  }
};

const createGame = async () => {
  const name = newGameInput.value.trim();
  if (!name) return;
  try {
    if (!storage) throw new Error("Storage not ready.");
    const game = await storage.createGame(name);
    newGameInput.value = "";
    setStatus(`Created ${game.name}.`);
    window.location.href = `game.html?game=${game.id}`;
  } catch (err) {
    setStatus(`Create failed: ${err.message}`);
  }
};

const connectDrive = async () => {
  try {
    if (!storage) throw new Error("Storage not ready.");
    await storage.signIn();
    syncAuthUi();
    await loadGames();
    setStatus("Connected to Google Drive.");
  } catch (err) {
    setStatus(`Sign-in failed: ${err.message}`);
  }
};

const disconnectDrive = async () => {
  if (!storage) return;
  await storage.signOut();
  gamesList.innerHTML = "<p class=\"empty\">Sign in to load games.</p>";
  syncAuthUi();
  setStatus("Disconnected.");
};

createGameButton.addEventListener("click", createGame);
newGameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createGame();
});
connectButton.addEventListener("click", connectDrive);
disconnectButton.addEventListener("click", disconnectDrive);

const boot = async () => {
  try {
    storage = createStorage();
    await storage.init();
    const restored = await storage.tryRestoreSession();
    syncAuthUi();
    if (restored) {
      await loadGames();
      setStatus("Connected to Google Drive.");
    } else {
      gamesList.innerHTML = "<p class=\"empty\">Connect to Google Drive to load games.</p>";
      setStatus("Connect to Google Drive to start.");
    }
  } catch (err) {
    setStatus(`Storage init failed: ${err.message}`);
  }
};

boot();
