const statusEl = document.getElementById("status");
const currentGameEl = document.getElementById("current-game");
const gameMetaEl = document.getElementById("game-meta");
const gameTitleEl = document.getElementById("game-title");
const cardsList = document.getElementById("cards-list");
const printLink = document.getElementById("print-link");
const renameGameButton = document.getElementById("rename-game");
const deleteGameButton = document.getElementById("delete-game");
const newCardButton = document.getElementById("new-card");
const saveCardButton = document.getElementById("save-card");
const deleteCardButton = document.getElementById("delete-card");
const previewCardButton = document.getElementById("preview-card");
const cardForm = document.getElementById("card-form");
const cardPreview = document.getElementById("card-preview");
const cardMeta = document.getElementById("card-meta");
const addSectionButton = document.getElementById("add-section");
const addItemButton = document.getElementById("add-item");
const saveTemplateButton = document.getElementById("save-template");
const nodeList = document.getElementById("node-list");
const templatePreview = document.getElementById("template-preview");
const dynamicFields = document.getElementById("dynamic-fields");
const fieldBadges = document.getElementById("field-badges");

const controlLabel = document.getElementById("control-label");
const controlBody = document.getElementById("control-body");
const controlNumber = document.getElementById("control-number");
const controlRange = document.getElementById("control-range");
const controlInput = document.getElementById("control-input");
const controlDec = document.getElementById("control-dec");
const controlInc = document.getElementById("control-inc");
const controlSelect = document.getElementById("control-select");
const controlSelectInput = document.getElementById("control-select-input");
const controlText = document.getElementById("control-text");
const controlTextInput = document.getElementById("control-text-input");
const controlAnchor = document.getElementById("control-anchor");
const controlAnchorGrid = document.getElementById("control-anchor-grid");
const moveUpButton = document.getElementById("move-up");
const moveDownButton = document.getElementById("move-down");
const deleteNodeButton = document.getElementById("delete-node");

const fields = {
  name: cardForm.querySelector("[name='name']")
};

const state = {
  currentGame: null,
  cards: [],
  currentCard: null,
  template: null,
  activeNode: null,
  activeField: null,
  previewUrl: null,
  templatePreviewUrl: null
};

const fieldConfigs = {
  section: [
    { key: "name", label: "Name", type: "text" },
    { key: "layout", label: "Layout", type: "select", options: ["row", "column", "stack"] },
    { key: "sizePct", label: "Size %", type: "number", min: 10, max: 100, step: 1 },
    { key: "gap", label: "Gap", type: "number", min: 0, max: 80, step: 1 }
  ],
  item: [
    { key: "name", label: "Name", type: "text" },
    { key: "fieldId", label: "Field ID", type: "text" },
    { key: "attachTarget", label: "Attach Target", type: "select" },
    { key: "attachAnchor", label: "Attach Anchor", type: "anchor" },
    { key: "anchor", label: "Item Anchor", type: "anchor" },
    { key: "widthPct", label: "Width %", type: "number", min: 5, max: 100, step: 1 },
    { key: "heightPct", label: "Height %", type: "number", min: 5, max: 100, step: 1 },
    { key: "fontSize", label: "Font Size", type: "number", min: 8, max: 120, step: 1 },
    { key: "align", label: "Align", type: "select", options: ["left", "center", "right"] },
    { key: "font", label: "Font", type: "select", options: ["title", "body"] },
    { key: "color", label: "Color", type: "text" }
  ]
};

const setStatus = (message) => {
  statusEl.textContent = message;
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  if (response.status === 204) return null;
  return response.json();
};

const gameId = new URLSearchParams(window.location.search).get("game");
if (!gameId) {
  currentGameEl.textContent = "No game selected";
  setStatus("Missing game id in URL.");
  throw new Error("Missing game id");
}

const renderCards = () => {
  cardsList.innerHTML = "";
  if (!state.cards.length) {
    cardsList.innerHTML = "<p class=\"empty\">No cards yet.</p>";
    return;
  }

  state.cards.forEach((card) => {
    const button = document.createElement("button");
    button.className = `list-item ${state.currentCard?.id === card.id ? "is-active" : ""}`;
    button.textContent = card.name;
    button.onclick = () => selectCard(card.id);
    cardsList.appendChild(button);
  });
};

const updateHeader = () => {
  if (!state.currentGame) return;
  currentGameEl.textContent = `${state.currentGame.name} (layout v2)`;
  gameTitleEl.textContent = `${state.currentGame.name} Editor`;
  const updated = new Date(state.currentGame.updatedAt).toLocaleString();
  gameMetaEl.textContent = `Last updated ${updated}`;
  printLink.href = `/print/${state.currentGame.id}`;
};

const resetForm = () => {
  cardForm.reset();
  cardMeta.textContent = "Card ID: —";
  cardPreview.src = "";
  state.currentCard = null;
};

const populateForm = (card) => {
  fields.name.value = card.name;
  const values = card.fields ?? {};
  Object.entries(values).forEach(([key, value]) => {
    const input = dynamicFields.querySelector(`[data-field='${key}']`);
    if (input) input.value = value;
  });
  cardMeta.textContent = `Card ID: ${card.id}`;
};

const formToCard = () => {
  const fieldsMap = {};
  dynamicFields.querySelectorAll("[data-field]").forEach((input) => {
    fieldsMap[input.dataset.field] = input.value.trim();
  });

  return {
    name: fields.name.value.trim(),
    fields: fieldsMap
  };
};

const refreshPreviewFromCard = (card) => {
  cardPreview.src = `/api/games/${state.currentGame.id}/cards/${card.id}.svg?ts=${Date.now()}`;
};

const previewDraft = async () => {
  try {
    const card = formToCard();
    sanitizeTemplate(state.template);
    const debugAttach = getDebugAttachInfo() ?? { note: "no-item-selected" };
    const response = await fetch(`/api/games/${state.currentGame.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card, template: state.template, debug: true, debugAttach })
    });
    if (!response.ok) throw new Error("Preview failed");
    const svg = await response.text();

    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    cardPreview.src = state.previewUrl;
    setStatus("Preview updated.");
  } catch (err) {
    setStatus(`Preview failed: ${err.message}`);
  }
};

const loadGame = async () => {
  try {
    state.currentGame = await fetchJson(`/api/games/${gameId}`);
    state.cards = await fetchJson(`/api/games/${gameId}/cards`);
    state.template = await fetchJson(`/api/games/${gameId}/template`);
    state.activeNode = { type: "section", id: state.template.root.id };
    updateHeader();
    renderCards();
    renderTemplate();
    resetForm();
  } catch (err) {
    setStatus(`Failed to load game: ${err.message}`);
  }
};

const selectCard = (cardId) => {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) return;
  state.currentCard = card;
  populateForm(card);
  renderCards();
  refreshPreviewFromCard(card);
};

const renameGame = async () => {
  if (!state.currentGame) return;
  const name = prompt("New game name", state.currentGame.name);
  if (!name) return;
  try {
    const game = await fetchJson(`/api/games/${state.currentGame.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    state.currentGame = game;
    updateHeader();
    setStatus("Game renamed.");
  } catch (err) {
    setStatus(`Rename failed: ${err.message}`);
  }
};

const deleteGame = async () => {
  if (!state.currentGame) return;
  if (!confirm(`Delete ${state.currentGame.name}? This removes all cards.`)) return;
  try {
    await fetchJson(`/api/games/${state.currentGame.id}`, { method: "DELETE" });
    window.location.href = "/";
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`);
  }
};

const createCard = () => {
  resetForm();
  setStatus("New card draft ready.");
};

const saveCard = async () => {
  const payload = formToCard();
  if (!payload.name) {
    setStatus("Name is required.");
    return;
  }
  try {
    let saved;
    if (state.currentCard) {
      saved = await fetchJson(`/api/games/${state.currentGame.id}/cards/${state.currentCard.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      saved = await fetchJson(`/api/games/${state.currentGame.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    state.cards = await fetchJson(`/api/games/${state.currentGame.id}/cards`);
    state.currentCard = saved;
    renderCards();
    populateForm(saved);
    refreshPreviewFromCard(saved);
    setStatus("Card saved.");
  } catch (err) {
    setStatus(`Save failed: ${err.message}`);
  }
};

const deleteCard = async () => {
  if (!state.currentGame || !state.currentCard) return;
  if (!confirm(`Delete ${state.currentCard.name}?`)) return;
  try {
    await fetchJson(`/api/games/${state.currentGame.id}/cards/${state.currentCard.id}`, {
      method: "DELETE"
    });
    state.cards = await fetchJson(`/api/games/${state.currentGame.id}/cards`);
    state.currentCard = null;
    renderCards();
    resetForm();
    setStatus("Card deleted.");
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`);
  }
};

const createSection = () => {
  const parent = findSectionById(state.template.root, state.activeNode?.id) || state.template.root;
  parent.children.push({
    id: `section-${Date.now()}`,
    name: "New Section",
    layout: "stack",
    sizePct: 50,
    gap: 12,
    children: [],
    items: []
  });
  renderTemplate();
  setStatus("Section added. Save template to apply.");
};

const createItem = () => {
  const parent = findSectionById(state.template.root, state.activeNode?.id) || state.template.root;
  const id = `item-${Date.now()}`;
  parent.items.push({
    id,
    name: "New Item",
    fieldId: `field-${parent.items.length + 1}`,
    anchor: { x: 0, y: 0 },
    attach: {
      targetType: "section",
      targetId: parent.id,
      anchor: { x: 0, y: 0 }
    },
    widthPct: 40,
    heightPct: 20,
    fontSize: 20,
    align: "left",
    font: "body"
  });
  renderTemplate();
  setStatus("Item added. Save template to apply.");
};

const updateTemplatePreview = async () => {
  try {
    sanitizeTemplate(state.template);
    const response = await fetch(`/api/games/${gameId}/template/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.template)
    });
    if (!response.ok) throw new Error("Preview failed");
    const svg = await response.text();
    if (state.templatePreviewUrl) URL.revokeObjectURL(state.templatePreviewUrl);
    state.templatePreviewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    templatePreview.src = state.templatePreviewUrl;
  } catch (err) {
    setStatus(`Template preview failed: ${err.message}`);
  }
};

const saveTemplate = async () => {
  try {
    sanitizeTemplate(state.template);
    const saved = await fetchJson(`/api/games/${gameId}/template`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.template)
    });
    state.template = saved;
    renderTemplate();
    setStatus("Template saved.");
  } catch (err) {
    setStatus(`Template save failed: ${err.message}`);
  }
};

const renderTemplate = () => {
  renderNodeList();
  renderFieldBadges();
  renderDynamicFields();
  updateTemplatePreview();
};

const isItemNode = (node) => Boolean(node && typeof node === "object" && "fieldId" in node);

const parseAttachTarget = (value, fallbackId) => {
  const raw = String(value || "");
  const [type, id] = raw.split(":");
  const targetType = type === "item" ? "item" : "section";
  const targetId = id || fallbackId || "";
  return { targetType, targetId };
};

const sanitizeTemplate = (template) => {
  const walk = (section, parentId) => {
    section.children = section.children ?? [];
    section.items = section.items ?? [];
    section.items.forEach((item) => {
      if (!item.attach) {
        item.attach = {
          targetType: "section",
          targetId: parentId ?? section.id,
          anchor: { x: 0, y: 0 }
        };
      }
      if (item.attachTarget) {
        const parsed = parseAttachTarget(item.attachTarget, parentId ?? section.id);
        if (parsed.targetId) {
          item.attach.targetType = parsed.targetType;
          item.attach.targetId = parsed.targetId;
        }
      }
      if (item.attachAnchor) {
        item.attach.anchor = item.attachAnchor;
      }
      if (item.attachTarget) delete item.attachTarget;
      if (item.attachAnchor) delete item.attachAnchor;
      item.attach.targetType = item.attach.targetType === "item" ? "item" : "section";
      if (item.attach.targetType === "item" && item.attach.targetId === item.id) {
        item.attach.targetType = "section";
        item.attach.targetId = parentId ?? section.id;
      }
      if (!item.attach.targetId) item.attach.targetId = parentId ?? section.id;
      item.attach.anchor = item.attach.anchor ?? { x: 0, y: 0 };
      item.anchor = item.anchor ?? { x: 0, y: 0 };
    });
    section.children.forEach((child) => walk(child, section.id));
  };

  walk(template.root, null);
};

const renderNodeList = () => {
  nodeList.innerHTML = "";
  const items = flattenNodes(state.template.root);
  items.forEach((node) => {
    const button = document.createElement("button");
    const active = state.activeNode?.id === node.id && state.activeNode?.type === node.type;
    button.className = `list-item ${active ? "is-active" : ""}`;
    button.style.marginLeft = `${node.depth * 14}px`;
    button.textContent = `${node.type === "section" ? "Section" : "Item"}: ${node.name}`;
    button.onclick = () => {
      state.activeNode = { type: node.type, id: node.id };
      state.activeField = null;
      renderTemplate();
    };
    nodeList.appendChild(button);
  });
};

const renderFieldBadges = () => {
  fieldBadges.innerHTML = "";
  controlLabel.textContent = state.activeNode ? "Select a field to edit." : "Select a section or item.";
  controlBody.hidden = true;

  if (!state.activeNode) return;
  const configList = fieldConfigs[state.activeNode.type];
  configList.forEach((field) => {
    const badge = document.createElement("button");
    badge.className = `badge ${state.activeField?.key === field.key ? "is-active" : ""}`;
    badge.textContent = field.label;
    badge.onclick = () => {
      state.activeField = field;
      renderFieldBadges();
      updateControlPanel();
    };
    fieldBadges.appendChild(badge);
  });
};

const renderDynamicFields = () => {
  dynamicFields.innerHTML = "";
  const fieldIds = new Set();
  collectItemFields(state.template.root, fieldIds);
  fieldIds.forEach((fieldId) => {
    if (fieldId === "name") return;
    const label = document.createElement("label");
    label.className = "full";
    const span = document.createElement("span");
    span.textContent = fieldId;
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.dataset.field = fieldId;
    label.appendChild(span);
    label.appendChild(textarea);
    dynamicFields.appendChild(label);
  });
};

const updateControlPanel = () => {
  hideControl(controlNumber);
  hideControl(controlSelect);
  hideControl(controlText);
  hideControl(controlAnchor);

  if (!state.activeNode || !state.activeField) {
    controlBody.hidden = true;
    return;
  }

  const field = state.activeField;
  const node = findNode(state.template.root, state.activeNode);
  if (!node) return;

  if (field.type === "anchor") {
    const anchor = getFieldValue(node, field.key);
    controlLabel.textContent = anchor
      ? `${field.label} (${anchor.x}, ${anchor.y})`
      : field.label;
  } else {
    controlLabel.textContent = field.label;
  }

  controlBody.hidden = false;

  if (field.type === "number") {
    showControl(controlNumber);
    const value = node[field.key] ?? 0;
    controlRange.min = String(field.min ?? 0);
    controlRange.max = String(field.max ?? 100);
    controlRange.step = String(field.step ?? 1);
    controlRange.value = String(value);
    controlInput.min = String(field.min ?? 0);
    controlInput.max = String(field.max ?? 100);
    controlInput.step = String(field.step ?? 1);
    controlInput.value = String(value);
  }

  if (field.type === "select") {
    showControl(controlSelect);
    controlSelectInput.innerHTML = "";
    const options =
      field.key === "attachTarget"
        ? buildAttachTargets(state.activeNode?.type === "item" ? state.activeNode.id : null)
        : field.options ?? [];
    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value ?? option;
      opt.textContent = option.label ?? option;
      controlSelectInput.appendChild(opt);
    });
    controlSelectInput.value = getFieldValue(node, field.key) ?? "";
  }

  if (field.type === "text") {
    showControl(controlText);
    controlTextInput.value = getFieldValue(node, field.key) ?? "";
  }

  if (field.type === "anchor") {
    showControl(controlAnchor);
    const anchor = getFieldValue(node, field.key) ?? { x: 0, y: 0 };
    updateAnchorGrid(anchor);
  }
};

const getFieldValue = (node, key) => {
  if (isItemNode(node) && key === "attachTarget") {
    if (node.attach) return `${node.attach.targetType}:${node.attach.targetId}`;
    return node.attachTarget ?? "";
  }
  if (isItemNode(node) && key === "attachAnchor") {
    if (node.attach) return node.attach.anchor;
    return node.attachAnchor ?? null;
  }
  return node[key];
};

const setFieldValue = (node, key, value) => {
  if (isItemNode(node) && key === "attachTarget") {
    if (!node.attach) {
      node.attach = {
        targetType: "section",
        targetId: "",
        anchor: { x: 0, y: 0 }
      };
    }
    const parsed = parseAttachTarget(value, node.attach.targetId);
    node.attach.targetType = parsed.targetType;
    node.attach.targetId = parsed.targetId;
    if (node.attachTarget) delete node.attachTarget;
    return;
  }
  if (isItemNode(node) && key === "attachAnchor") {
    if (!node.attach) {
      node.attach = {
        targetType: "section",
        targetId: "",
        anchor: { x: 0, y: 0 }
      };
    }
    node.attach.anchor = value;
    if (node.attachAnchor) delete node.attachAnchor;
    return;
  }
  node[key] = value;
};

const updateAnchorGrid = (anchor) => {
  controlAnchorGrid.querySelectorAll("button").forEach((button) => {
    const ax = Number(button.dataset.ax);
    const ay = Number(button.dataset.ay);
    const active = anchor && Math.abs(ax - anchor.x) < 0.01 && Math.abs(ay - anchor.y) < 0.01;
    button.classList.toggle("is-active", active);
  });
};

const bindControlEvents = () => {
  controlRange.addEventListener("input", () => {
    const node = findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, Number(controlRange.value));
    updateControlPanel();
    updateTemplatePreview();
  });

  controlInput.addEventListener("input", () => {
    const node = findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, Number(controlInput.value || 0));
    updateControlPanel();
    updateTemplatePreview();
  });

  controlDec.addEventListener("click", () => {
    const step = Number(controlRange.step || 1);
    controlInput.value = String(Number(controlInput.value || 0) - step);
    controlInput.dispatchEvent(new Event("input"));
  });

  controlInc.addEventListener("click", () => {
    const step = Number(controlRange.step || 1);
    controlInput.value = String(Number(controlInput.value || 0) + step);
    controlInput.dispatchEvent(new Event("input"));
  });

  controlSelectInput.addEventListener("change", () => {
    const node = findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, controlSelectInput.value);
    updateControlPanel();
    updateTemplatePreview();
  });

  controlTextInput.addEventListener("input", () => {
    const node = findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, controlTextInput.value.trim());
    renderNodeList();
    updateTemplatePreview();
  });

  controlAnchorGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const node = findNode(state.template.root, state.activeNode);
      if (!node || !state.activeField) return;
      const anchor = { x: Number(button.dataset.ax), y: Number(button.dataset.ay) };
      setFieldValue(node, state.activeField.key, anchor);
      updateControlPanel();
      updateTemplatePreview();
    });
  });

  moveUpButton.addEventListener("click", () => moveNode(-1));
  moveDownButton.addEventListener("click", () => moveNode(1));
  deleteNodeButton.addEventListener("click", deleteNode);
};

const moveNode = (direction) => {
  if (!state.activeNode) return;
  const location = findNodeLocation(state.template.root, state.activeNode);
  if (!location) return;
  const { list, index } = location;
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  renderTemplate();
  setStatus("Order updated. Save template to apply.");
};

const deleteNode = () => {
  if (!state.activeNode) return;
  if (!confirm("Delete this node?")) return;
  const location = findNodeLocation(state.template.root, state.activeNode);
  if (!location) return;
  location.list.splice(location.index, 1);
  state.activeNode = { type: "section", id: state.template.root.id };
  state.activeField = null;
  renderTemplate();
  setStatus("Node deleted. Save template to apply.");
};

const flattenNodes = (section, depth = 0) => {
  const nodes = [{ type: "section", id: section.id, name: section.name, depth }];
  section.items.forEach((item) => {
    nodes.push({ type: "item", id: item.id, name: item.name, depth: depth + 1 });
  });
  section.children.forEach((child) => {
    nodes.push(...flattenNodes(child, depth + 1));
  });
  return nodes;
};

const collectItemFields = (section, fieldsSet) => {
  section.items.forEach((item) => fieldsSet.add(item.fieldId));
  section.children.forEach((child) => collectItemFields(child, fieldsSet));
};

const findSectionById = (section, id) => {
  if (!id) return null;
  if (section.id === id) return section;
  for (const child of section.children) {
    const found = findSectionById(child, id);
    if (found) return found;
  }
  return null;
};

const findNode = (section, active) => {
  if (!active) return null;
  if (active.type === "section") return findSectionById(section, active.id);
  return findItemById(section, active.id);
};

const findItemById = (section, id) => {
  const item = section.items.find((candidate) => candidate.id === id);
  if (item) return item;
  for (const child of section.children) {
    const found = findItemById(child, id);
    if (found) return found;
  }
  return null;
};

const buildAttachTargets = (excludeItemId) => {
  const options = [];
  const nodes = flattenNodes(state.template.root);
  nodes.forEach((node) => {
    if (node.type === "item" && excludeItemId && node.id === excludeItemId) return;
    const label = `${node.type}: ${node.name}`;
    options.push({ value: `${node.type}:${node.id}`, label });
  });
  return options;
};

const getDebugAttachInfo = () => {
  if (!state.activeNode || state.activeNode.type !== "item") return null;
  const node = findItemById(state.template.root, state.activeNode.id);
  if (!node) return null;
  return {
    id: node.id,
    targetType: node.attach.targetType,
    targetId: node.attach.targetId,
    attachAnchor: node.attach.anchor,
    itemAnchor: node.anchor
  };
};

const findNodeLocation = (section, active) => {
  if (!active) return null;
  if (active.type === "section") {
    return findSectionLocation(section, active.id);
  }
  return findItemLocation(section, active.id);
};

const findSectionLocation = (section, id) => {
  const index = section.children.findIndex((child) => child.id === id);
  if (index >= 0) {
    return { list: section.children, index };
  }
  for (const child of section.children) {
    const found = findSectionLocation(child, id);
    if (found) return found;
  }
  return null;
};

const findItemLocation = (section, id) => {
  const index = section.items.findIndex((item) => item.id === id);
  if (index >= 0) {
    return { list: section.items, index };
  }
  for (const child of section.children) {
    const found = findItemLocation(child, id);
    if (found) return found;
  }
  return null;
};

const showControl = (el) => {
  el.hidden = false;
  el.style.display = "";
};

const hideControl = (el) => {
  el.hidden = true;
  el.style.display = "none";
};

renameGameButton.addEventListener("click", renameGame);
deleteGameButton.addEventListener("click", deleteGame);
newCardButton.addEventListener("click", createCard);
previewCardButton.addEventListener("click", previewDraft);
saveCardButton.addEventListener("click", saveCard);
deleteCardButton.addEventListener("click", deleteCard);
addSectionButton.addEventListener("click", createSection);
addItemButton.addEventListener("click", createItem);
saveTemplateButton.addEventListener("click", saveTemplate);
cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCard();
});

bindControlEvents();
loadGame();
