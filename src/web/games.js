const gamesList = document.getElementById("games-list");
const newGameInput = document.getElementById("new-game-name");
const createGameButton = document.getElementById("create-game");
const statusEl = document.getElementById("status");

const setStatus = (message) => {
  statusEl.textContent = message;
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  return response.json();
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
    link.href = `/game.html?game=${game.id}`;
    link.textContent = game.name;
    gamesList.appendChild(link);
  });
};

const loadGames = async () => {
  try {
    const games = await fetchJson("/api/games");
    renderGames(games);
  } catch (err) {
    setStatus(`Failed to load games: ${err.message}`);
  }
};

const createGame = async () => {
  const name = newGameInput.value.trim();
  if (!name) return;
  try {
    const game = await fetchJson("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    newGameInput.value = "";
    setStatus(`Created ${game.name}.`);
    window.location.href = `/game.html?game=${game.id}`;
  } catch (err) {
    setStatus(`Create failed: ${err.message}`);
  }
};

createGameButton.addEventListener("click", createGame);
newGameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createGame();
});

loadGames();
