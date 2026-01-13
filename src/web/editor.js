import { createStorage } from "./storage.js";
import { renderCardSvg, renderTemplateSvg } from "./render.js";

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
const connectButton = document.getElementById("connect-drive");
const disconnectButton = document.getElementById("disconnect-drive");

const controlLabel = document.getElementById("control-label");
const controlBody = document.getElementById("control-body");
const controlActions = document.getElementById("control-actions");
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

const itemTypeModal = document.getElementById("item-type-modal");
const itemTypeSelect = document.getElementById("item-type-select");
const itemTypeConfirm = document.getElementById("item-type-confirm");
const itemTypeCancel = document.getElementById("item-type-cancel");
const cardIdInput = document.getElementById("card-id-input");

// Card field control elements
const cardFieldBadges = document.getElementById("card-field-badges");
const cardControlLabel = document.getElementById("card-control-label");
const cardControlBody = document.getElementById("card-control-body");
const cardControlText = document.getElementById("card-control-text");
const cardControlTextarea = document.getElementById("card-control-textarea");
const cardControlImage = document.getElementById("card-control-image");
const cardImagePreview = document.getElementById("card-image-preview");
const cardImageUrl = document.getElementById("card-image-url");
const cardImageFile = document.getElementById("card-image-file");
const cardImageUpload = document.getElementById("card-image-upload");
const cardImageClear = document.getElementById("card-image-clear");

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
  activeCardField: null,
  cardFieldValues: {},
  previewUrl: null,
  templatePreviewUrl: null
};

const CARD_PRESETS = {
  "poker": { name: "Poker (2.5\" × 3.5\")", width: 750, height: 1050, radius: 28, bleed: 18 },
  "bridge": { name: "Bridge (2.25\" × 3.5\")", width: 675, height: 1050, radius: 28, bleed: 18 },
  "mini": { name: "Mini (1.75\" × 2.5\")", width: 525, height: 750, radius: 21, bleed: 15 },
  "tarot": { name: "Tarot (2.75\" × 4.75\")", width: 825, height: 1425, radius: 28, bleed: 18 },
  "custom": { name: "Custom", width: 750, height: 1050, radius: 28, bleed: 18 }
};

const fieldConfigs = {
  template: [
    { key: "name", label: "Name", type: "text" },
    { key: "preset", label: "Card Size Preset", type: "select", options: Object.keys(CARD_PRESETS).map(k => ({ value: k, label: CARD_PRESETS[k].name })) },
    { key: "width", label: "Width (px)", type: "number", min: 100, max: 3000, step: 25 },
    { key: "height", label: "Height (px)", type: "number", min: 100, max: 3000, step: 25 },
    { key: "radius", label: "Corner Radius (px)", type: "number", min: 0, max: 100, step: 1 },
    { key: "bleed", label: "Bleed (px)", type: "number", min: 0, max: 50, step: 1 }
  ],
  section: [
    { key: "name", label: "Name", type: "text" },
    { key: "parentSection", label: "Parent Section", type: "select" },
    { key: "layout", label: "Layout", type: "select", options: ["row", "column", "stack"] },
    { key: "sizePct", label: "Size %", type: "number", min: 10, max: 100, step: 1 },
    { key: "gap", label: "Gap", type: "number", min: 0, max: 80, step: 1 }
  ],
  item: [
    { key: "name", label: "Name", type: "text" },
    { key: "type", label: "Item Type", type: "select", options: ["text", "frame", "image"] },
    { key: "parentSection", label: "Parent Section", type: "select" },
    { key: "fieldId", label: "Field ID", type: "text", itemTypes: ["text", "image"] },
    { key: "attachTarget", label: "Attach Target", type: "select" },
    { key: "attachAnchor", label: "Attach Anchor", type: "anchor" },
    { key: "anchor", label: "Item Anchor", type: "anchor" },
    { key: "widthPct", label: "Width %", type: "number", min: 5, max: 100, step: 1 },
    { key: "heightPct", label: "Height %", type: "number", min: 5, max: 100, step: 1 },
    { key: "fontSize", label: "Font Size", type: "number", min: 8, max: 120, step: 1, itemTypes: ["text"] },
    { key: "align", label: "Align", type: "select", options: ["left", "center", "right"], itemTypes: ["text"] },
    { key: "font", label: "Font", type: "select", options: ["title", "body"], itemTypes: ["text"] },
    { key: "color", label: "Color", type: "text", itemTypes: ["text"] },
    { key: "strokeWidth", label: "Stroke Width", type: "number", min: 0, max: 20, step: 0.5, itemTypes: ["frame"] },
    { key: "strokeColor", label: "Stroke Color", type: "text", itemTypes: ["frame"] },
    { key: "fillColor", label: "Fill Color", type: "text", itemTypes: ["frame"] },
    { key: "cornerRadius", label: "Corner Radius", type: "number", min: 0, max: 50, step: 1, itemTypes: ["frame", "image"] },
    { key: "fit", label: "Image Fit", type: "select", options: ["cover", "contain", "fill"], itemTypes: ["image"] }
  ]
};

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
  printLink.href = "#";
};

const resetForm = () => {
  cardForm.reset();
  cardIdInput.value = "";
  cardIdInput.placeholder = "auto-generated";
  cardPreview.src = "";
  state.currentCard = null;
  state.activeCardField = null;
  state.cardFieldValues = {};
};

const populateForm = (card) => {
  fields.name.value = card.name;
  cardIdInput.value = card.id;
  state.cardFieldValues = card.fields ?? {};
};

const formToCard = () => {
  return {
    name: fields.name.value.trim(),
    fields: state.cardFieldValues
  };
};

const setPreviewImage = (svg, target, key) => {
  if (state[key]) URL.revokeObjectURL(state[key]);
  state[key] = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  target.src = state[key];
};

const refreshPreviewFromCard = (card) => {
  if (!state.template) return;
  const svg = renderCardSvg(card, state.template);
  setPreviewImage(svg, cardPreview, "previewUrl");
};

const previewDraft = async () => {
  try {
    const card = formToCard();
    sanitizeTemplate(state.template);
    const svg = renderCardSvg(card, state.template, { debug: false });
    setPreviewImage(svg, cardPreview, "previewUrl");
    setStatus("Preview updated.");
  } catch (err) {
    setStatus(`Preview failed: ${err.message}`);
  }
};

const loadGame = async () => {
  try {
    if (!storage) {
      setStatus("Storage not ready.");
      return;
    }
    if (!storage.isAuthorized()) {
      setStatus("Connect to Google Drive to load this game.");
      return;
    }
    state.currentGame = await storage.getGame(gameId);
    state.cards = await storage.listCards(gameId);
    state.template = await storage.loadTemplate(gameId);
    state.activeNode = { type: "section", id: state.template.root.id };
    updateHeader();
    renderCards();
    renderTemplate();
    
    // Auto-select first card if available, otherwise reset form
    if (state.cards.length > 0) {
      selectCard(state.cards[0].id);
    } else {
      resetForm();
    }
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
  renderCardFieldBadges();
  refreshPreviewFromCard(card);
};

const renameGame = async () => {
  if (!state.currentGame) return;
  const name = prompt("New game name", state.currentGame.name);
  if (!name) return;
  try {
    if (!storage) throw new Error("Storage not ready.");
    const game = await storage.updateGame(state.currentGame.id, { name });
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
    if (!storage) throw new Error("Storage not ready.");
    await storage.deleteGame(state.currentGame.id);
    window.location.href = "index.html";
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`);
  }
};

const createCard = () => {
  resetForm();
  renderCards();
  renderCardFieldBadges();
  setStatus("New card draft ready.");
};

const saveCard = async () => {
  if (!storage) {
    setStatus("Storage not ready.");
    return;
  }
  const activeStorage = storage;
  const payload = formToCard();
  if (!payload.name) {
    setStatus("Name is required.");
    return;
  }
  
  // Use custom card ID if provided, otherwise let storage generate one
  const customId = cardIdInput.value.trim();
  
  try {
    let saved;
    if (state.currentCard) {
      // Updating existing card
      // Note: If user changes the ID, this creates a new card with the new ID
      // and leaves the old card intact (not deleted) to prevent accidental data loss
      const cardId = customId && customId !== state.currentCard.id ? customId : state.currentCard.id;
      saved = await activeStorage.saveCard(state.currentGame.id, cardId, payload);
    } else {
      // Creating new card
      saved = await activeStorage.saveCard(state.currentGame.id, customId || null, payload);
    }
    state.cards = await activeStorage.listCards(state.currentGame.id);
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
    if (!storage) throw new Error("Storage not ready.");
    const activeStorage = storage;
    await activeStorage.deleteCard(state.currentGame.id, state.currentCard.id);
    state.cards = await activeStorage.listCards(state.currentGame.id);
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
  // Show modal to select item type
  showItemTypeModal();
};

const showItemTypeModal = () => {
  // Reset select to default
  itemTypeSelect.value = "text";
  // Show modal
  itemTypeModal.hidden = false;
};

const hideItemTypeModal = () => {
  itemTypeModal.hidden = true;
};

const confirmItemCreation = () => {
  const type = itemTypeSelect.value;
  hideItemTypeModal();
  
  // If an item is selected, add the new item as a sibling
  if (state.activeNode?.type === "item") {
    const location = findNodeLocation(state.template.root, state.activeNode);
    if (location) {
      // Find the parent section that contains this items list
      const parentSection = findSectionByItemsList(state.template.root, location.list);
      if (parentSection) {
        const id = `item-${Date.now()}`;
        const newItem = createItemByType(type, id, parentSection);
        // Insert after the selected item
        location.list.splice(location.index + 1, 0, newItem);
        renderTemplate();
        setStatus("Item added. Save template to apply.");
        return;
      }
    }
  }

  // Default behavior: add to the selected section or root
  const parent = findSectionById(state.template.root, state.activeNode?.id) || state.template.root;
  const id = `item-${Date.now()}`;
  parent.items.push(createItemByType(type, id, parent));
  renderTemplate();
  setStatus("Item added. Save template to apply.");
};

const createItemByType = (type, id, parentSection) => {
  const baseItem = {
    id,
    name: "New Item",
    anchor: { x: 0, y: 0 },
    attach: {
      targetType: "section",
      targetId: parentSection.id,
      anchor: { x: 0, y: 0 }
    },
    widthPct: 40,
    heightPct: 20
  };
  
  if (type === "text") {
    return {
      ...baseItem,
      type: "text",
      fieldId: `field-${parentSection.items.length + 1}`,
      fontSize: 20,
      align: "left",
      font: "body"
    };
  }
  
  if (type === "frame") {
    return {
      ...baseItem,
      type: "frame",
      strokeWidth: 2,
      cornerRadius: 8
    };
  }
  
  if (type === "image") {
    return {
      ...baseItem,
      type: "image",
      fieldId: `image-${parentSection.items.length + 1}`,
      fit: "cover",
      cornerRadius: 0
    };
  }
  
  // Default to text
  return {
    ...baseItem,
    type: "text",
    fieldId: `field-${parentSection.items.length + 1}`,
    fontSize: 20,
    align: "left",
    font: "body"
  };
};

const updateTemplatePreview = async () => {
  try {
    sanitizeTemplate(state.template);
    const svg = renderTemplateSvg(state.template, state.activeNode);
    setPreviewImage(svg, templatePreview, "templatePreviewUrl");
    
    // Also update card preview if a card is selected
    if (state.currentCard) {
      const card = formToCard();
      refreshPreviewFromCard(card);
    }
  } catch (err) {
    setStatus(`Template preview failed: ${err.message}`);
  }
};

const saveTemplate = async () => {
  try {
    sanitizeTemplate(state.template);
    if (!storage) throw new Error("Storage not ready.");
    const saved = await storage.saveTemplate(gameId, state.template);
    state.template = saved;
    renderTemplate();
    setStatus("Template saved.");
  } catch (err) {
    setStatus(`Template save failed: ${err.message}`);
  }
};

const svgToDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const buildPrintHtml = (gameId, cards, template) => {
  const items = cards
    .map((card) => {
      const svg = renderCardSvg(card, template);
      return `<div class="sheet-card"><img src="${svgToDataUrl(svg)}" alt="${card.name}" /></div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Print Sheet - ${gameId}</title>
    <style>
      @page { margin: 10mm; }
      body {
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
        background: #f4efe6;
        color: #1b1a17;
      }
      header {
        padding: 16px 18px 6px;
      }
      h1 { margin: 0; font-size: 20px; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        padding: 12px;
      }
      .sheet-card {
        background: #fffaf2;
        border: 1px solid #d7cdbd;
        border-radius: 12px;
        padding: 6px;
        break-inside: avoid;
      }
      .sheet-card img {
        width: 100%;
        display: block;
      }
      @media print {
        header { display: none; }
        body { background: white; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Print Sheet — ${gameId}</h1>
      <p>Use your browser print dialog.</p>
    </header>
    <section class="sheet">${items}</section>
  </body>
</html>`;
};

const openPrintView = () => {
  if (!state.currentGame || !state.template) return;
  if (!state.cards.length) {
    setStatus("No cards to print.");
    return;
  }
  const html = buildPrintHtml(state.currentGame.id, state.cards, state.template);
  const printWindow = window.open("", "_blank", "noopener");
  if (!printWindow) {
    setStatus("Popup blocked. Allow popups to open the print view.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

const renderTemplate = () => {
  renderNodeList();
  renderFieldBadges();
  renderDynamicFields();
  renderCardFieldBadges();
  updateControlPanel();
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
  
  // Add template-level button at the top
  const templateButton = document.createElement("button");
  const templateActive = state.activeNode?.type === "template";
  templateButton.className = `list-item ${templateActive ? "is-active" : ""}`;
  templateButton.textContent = `Template: ${state.template.name}`;
  templateButton.onclick = () => {
    state.activeNode = { type: "template", id: state.template.id };
    state.activeField = null;
    renderTemplate();
  };
  nodeList.appendChild(templateButton);
  
  const items = flattenNodes(state.template.root);
  items.forEach((node) => {
    const button = document.createElement("button");
    const active = state.activeNode?.id === node.id && state.activeNode?.type === node.type;
    button.className = `list-item ${active ? "is-active" : ""}`;
    button.style.marginLeft = `${node.depth * 14}px`;
    
    // Show item type in the label for items
    let label = `${node.type === "section" ? "Section" : "Item"}: ${node.name}`;
    if (node.type === "item" && node.obj?.type) {
      label = `${node.obj.type.charAt(0).toUpperCase() + node.obj.type.slice(1)} Item: ${node.name}`;
    }
    
    button.textContent = label;
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
  controlBody.hidden = !state.activeNode;

  if (!state.activeNode) return;
  const configList = fieldConfigs[state.activeNode.type];
  const isRoot = state.activeNode.type === "section" && state.activeNode.id === state.template.root.id;
  
  // Get the current node to check its item type
  const node = state.activeNode.type === "section" 
    ? findSectionById(state.template.root, state.activeNode.id)
    : findItemById(state.template.root, state.activeNode.id);
  
  const itemType = node?.type ?? "text"; // Default to text for legacy items
  
  configList.forEach((field) => {
    // Skip parent section field for root node
    if (field.key === "parentSection" && isRoot) return;
    
    // Skip fields that are not applicable to the current item type
    if (state.activeNode.type === "item" && field.itemTypes && !field.itemTypes.includes(itemType)) {
      return;
    }
    
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
  // Save current field values before clearing
  const currentValues = {};
  dynamicFields.querySelectorAll("[data-field]").forEach((input) => {
    currentValues[input.dataset.field] = input.value;
  });
  
  dynamicFields.innerHTML = "";
  const fieldsMap = new Map();
  collectItemFieldsWithTypes(state.template.root, fieldsMap);
  fieldsMap.forEach((fieldType, fieldId) => {
    if (fieldId === "name") return;
    
    if (fieldType === "image") {
      // Create image field UI with file upload and URL input
      const container = document.createElement("div");
      container.className = "full image-field";
      
      const labelSpan = document.createElement("span");
      labelSpan.textContent = fieldId;
      container.appendChild(labelSpan);
      
      // Hidden textarea to store the actual data
      const textarea = document.createElement("textarea");
      textarea.dataset.field = fieldId;
      textarea.style.display = "none";
      container.appendChild(textarea);
      
      // Image preview
      const preview = document.createElement("img");
      preview.className = "image-field__preview";
      preview.style.maxWidth = "100%";
      preview.style.maxHeight = "200px";
      preview.style.display = "none";
      preview.style.marginTop = "8px";
      preview.style.border = "1px solid #d7cdbd";
      preview.style.borderRadius = "8px";
      container.appendChild(preview);
      
      // URL input
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "Enter image URL or upload a file";
      urlInput.className = "image-field__url";
      urlInput.addEventListener("input", (e) => {
        const url = e.target.value.trim();
        textarea.value = url;
        if (url) {
          preview.src = url;
          preview.style.display = "block";
        } else {
          preview.style.display = "none";
        }
      });
      container.appendChild(urlInput);
      
      // File upload button
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
          // Convert file to base64 data URL
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target.result;
            textarea.value = dataUrl;
            urlInput.value = '[Uploaded Image]';
            preview.src = dataUrl;
            preview.style.display = "block";
          };
          reader.onerror = () => {
            setStatus(`Failed to read file: ${file.name}`);
          };
          reader.readAsDataURL(file);
        } catch (err) {
          setStatus(`Error loading file: ${err.message}`);
        }
      });
      container.appendChild(fileInput);
      
      const uploadButton = document.createElement("button");
      uploadButton.type = "button";
      uploadButton.className = "button button--ghost";
      uploadButton.textContent = "Upload Image";
      uploadButton.style.marginTop = "8px";
      uploadButton.addEventListener("click", () => fileInput.click());
      container.appendChild(uploadButton);
      
      // Clear button
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "button button--ghost";
      clearButton.textContent = "Clear";
      clearButton.style.marginTop = "8px";
      clearButton.style.marginLeft = "8px";
      clearButton.addEventListener("click", () => {
        textarea.value = "";
        urlInput.value = "";
        preview.style.display = "none";
        fileInput.value = "";
      });
      container.appendChild(clearButton);
      
      dynamicFields.appendChild(container);
    } else {
      // Create regular text field UI
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
    }
  });
  
  // Restore saved values
  dynamicFields.querySelectorAll("[data-field]").forEach((input) => {
    const fieldId = input.dataset.field;
    if (fieldId in currentValues) {
      input.value = currentValues[fieldId];
      
      // If this is an image field, also update the URL input and preview
      const container = input.closest('.image-field');
      if (container) {
        const urlInput = container.querySelector('.image-field__url');
        const preview = container.querySelector('.image-field__preview');
        
        // Only proceed if the DOM structure is complete
        if (urlInput && preview) {
          const value = currentValues[fieldId];
          
          if (value && typeof value === 'string') {
            // Check if it's a data URL or regular URL
            if (value.startsWith('data:')) {
              urlInput.value = '[Uploaded Image]';
            } else {
              urlInput.value = value;
            }
            preview.src = value;
            preview.style.display = "block";
          } else {
            urlInput.value = "";
            preview.style.display = "none";
          }
        }
      }
    }
  });
};

const renderCardFieldBadges = () => {
  cardFieldBadges.innerHTML = "";
  cardControlLabel.textContent = "Select a field to edit.";
  cardControlBody.hidden = true;

  if (!state.template) return;

  const fieldsMap = new Map();
  collectItemFieldsWithTypes(state.template.root, fieldsMap);
  
  fieldsMap.forEach((fieldType, fieldId) => {
    if (fieldId === "name") return;
    
    const badge = document.createElement("button");
    badge.className = `badge ${state.activeCardField === fieldId ? "is-active" : ""}`;
    badge.textContent = fieldId;
    badge.onclick = () => {
      state.activeCardField = fieldId;
      renderCardFieldBadges();
      updateCardFieldControlPanel(fieldId, fieldType);
    };
    cardFieldBadges.appendChild(badge);
  });
};

const updateCardFieldControlPanel = (fieldId, fieldType) => {
  if (!fieldId) {
    cardControlBody.hidden = true;
    cardControlLabel.textContent = "Select a field to edit.";
    return;
  }

  cardControlLabel.textContent = fieldId;
  cardControlBody.hidden = false;

  const currentValue = state.cardFieldValues[fieldId] || "";

  if (fieldType === "image") {
    // Show image controls
    cardControlText.hidden = true;
    cardControlImage.hidden = false;

    // Set current value
    if (currentValue) {
      if (currentValue.startsWith('data:')) {
        cardImageUrl.value = '[Uploaded Image]';
      } else {
        cardImageUrl.value = currentValue;
      }
      cardImagePreview.src = currentValue;
      cardImagePreview.style.display = "block";
    } else {
      cardImageUrl.value = "";
      cardImagePreview.style.display = "none";
    }
  } else {
    // Show text controls (default for text fields)
    cardControlText.hidden = false;
    cardControlImage.hidden = true;
    cardControlTextarea.value = currentValue;
  }
};

const bindCardFieldEvents = () => {
  // Textarea input handler
  cardControlTextarea.addEventListener("input", () => {
    if (!state.activeCardField) return;
    state.cardFieldValues[state.activeCardField] = cardControlTextarea.value.trim();
    autoUpdatePreview();
  });

  // Image URL input handler
  cardImageUrl.addEventListener("input", () => {
    if (!state.activeCardField) return;
    const url = cardImageUrl.value.trim();
    state.cardFieldValues[state.activeCardField] = url;
    if (url && !url.startsWith('[')) {
      cardImagePreview.src = url;
      cardImagePreview.style.display = "block";
    } else {
      cardImagePreview.style.display = "none";
    }
    autoUpdatePreview();
  });

  // Image file upload handler
  cardImageUpload.addEventListener("click", () => {
    cardImageFile.click();
  });

  cardImageFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file || !state.activeCardField) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        state.cardFieldValues[state.activeCardField] = dataUrl;
        cardImageUrl.value = '[Uploaded Image]';
        cardImagePreview.src = dataUrl;
        cardImagePreview.style.display = "block";
        autoUpdatePreview();
      };
      reader.onerror = () => {
        setStatus(`Failed to read file: ${file.name}`);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setStatus(`Error loading file: ${err.message}`);
    }
  });

  // Image clear handler
  cardImageClear.addEventListener("click", () => {
    if (!state.activeCardField) return;
    state.cardFieldValues[state.activeCardField] = "";
    cardImageUrl.value = "";
    cardImagePreview.style.display = "none";
    cardImageFile.value = "";
    autoUpdatePreview();
  });
};

let previewUpdateTimer = null;

const autoUpdatePreview = () => {
  // Only update if we have a current card and template
  if (!state.currentCard || !state.template) return;
  
  // Debounce updates to avoid excessive re-rendering while typing
  if (previewUpdateTimer) {
    clearTimeout(previewUpdateTimer);
  }
  
  previewUpdateTimer = setTimeout(() => {
    try {
      const card = formToCard();
      refreshPreviewFromCard(card);
    } catch (err) {
      // Log errors but don't interrupt the user's typing
      console.error("Preview update error:", err);
    }
  }, 300);
};

const updateControlPanel = () => {
  hideControl(controlNumber);
  hideControl(controlSelect);
  hideControl(controlText);
  hideControl(controlAnchor);

  if (!state.activeNode) {
    controlBody.hidden = true;
    return;
  }

  const node = state.activeNode.type === "template" ? state.template : findNode(state.template.root, state.activeNode);
  if (!node) return;

  // If no field is selected, show Move Up/Move Down/Delete buttons for the node
  if (!state.activeField) {
    controlBody.hidden = false;
    
    // Only show actions for non-template nodes
    if (state.activeNode.type !== "template") {
      showControl(controlActions);
      
      // Check if the node is movable (not the root)
      const isRoot = state.activeNode.id === state.template.root.id;
      const location = findNodeLocation(state.template.root, state.activeNode);
      const canMove = !isRoot && location !== null;
      
      // Show/hide Move Up and Move Down based on whether node is movable
      moveUpButton.hidden = !canMove;
      moveDownButton.hidden = !canMove;
      
      // Delete button is always shown for selected nodes
      deleteNodeButton.hidden = false;
    } else {
      hideControl(controlActions);
    }
    
    return;
  }

  // If a field is selected, hide the action buttons and show field controls
  hideControl(controlActions);
  
  const field = state.activeField;
  
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
    let options = [];
    if (field.key === "attachTarget") {
      options = buildAttachTargets(state.activeNode?.type === "item" ? state.activeNode.id : null);
    } else if (field.key === "parentSection") {
      options = buildParentSectionOptions(state.activeNode?.type === "section" ? state.activeNode.id : null);
    } else if (field.key === "preset") {
      options = field.options;
    } else {
      options = field.options ?? [];
    }
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
  if (key === "preset") {
    // Determine which preset matches the current dimensions
    for (const [presetKey, preset] of Object.entries(CARD_PRESETS)) {
      if (preset.width === node.width && preset.height === node.height && 
          preset.radius === node.radius && preset.bleed === node.bleed) {
        return presetKey;
      }
    }
    return "custom";
  }
  if (key === "parentSection") {
    const parent = findParentSection(state.template.root, node.id, !isItemNode(node));
    return parent ? parent.id : "";
  }
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
  if (key === "preset") {
    const preset = CARD_PRESETS[value];
    if (preset && value !== "custom") {
      node.width = preset.width;
      node.height = preset.height;
      node.radius = preset.radius;
      node.bleed = preset.bleed;
      renderFieldBadges();
      renderNodeList();
    }
    return;
  }
  if (key === "parentSection") {
    const success = reparentNode(node.id, isItemNode(node) ? "item" : "section", value);
    if (success) {
      renderNodeList();
      setStatus("Node reparented. Save template to apply.");
    } else {
      setStatus("Cannot reparent to that section.");
    }
    return;
  }
  if (isItemNode(node) && key === "type") {
    // When changing item type, preserve common fields and add/remove type-specific fields
    const oldType = node.type ?? "text";
    const newType = value;
    
    if (oldType !== newType) {
      node.type = newType;
      
      // Add default values for type-specific fields
      if (newType === "text") {
        if (!node.fieldId) node.fieldId = "field-1";
        if (!node.fontSize) node.fontSize = 20;
        if (!node.align) node.align = "left";
        if (!node.font) node.font = "body";
      } else if (newType === "frame") {
        if (!node.strokeWidth) node.strokeWidth = 2;
        if (!node.cornerRadius) node.cornerRadius = 8;
        // Remove text-specific fields
        delete node.fontSize;
        delete node.align;
        delete node.font;
        delete node.color;
      } else if (newType === "image") {
        if (!node.fieldId) node.fieldId = "image-1";
        if (!node.fit) node.fit = "cover";
        if (!node.cornerRadius) node.cornerRadius = 0;
        // Remove text-specific fields
        delete node.fontSize;
        delete node.align;
        delete node.font;
        delete node.color;
      }
      
      // Re-render to update available fields
      renderFieldBadges();
      setStatus("Item type changed. Update fields as needed.");
    }
    return;
  }
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
    const node = state.activeNode?.type === "template" ? state.template : findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, Number(controlRange.value));
    updateControlPanel();
    updateTemplatePreview();
  });

  controlInput.addEventListener("input", () => {
    const node = state.activeNode?.type === "template" ? state.template : findNode(state.template.root, state.activeNode);
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
    const node = state.activeNode?.type === "template" ? state.template : findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, controlSelectInput.value);
    updateControlPanel();
    updateTemplatePreview();
  });

  controlTextInput.addEventListener("input", () => {
    const node = state.activeNode?.type === "template" ? state.template : findNode(state.template.root, state.activeNode);
    if (!node || !state.activeField) return;
    setFieldValue(node, state.activeField.key, controlTextInput.value.trim());
    renderNodeList();
    updateTemplatePreview();
  });

  controlAnchorGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const node = state.activeNode?.type === "template" ? state.template : findNode(state.template.root, state.activeNode);
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
  const nodes = [{ type: "section", id: section.id, name: section.name, depth, obj: section }];
  section.items.forEach((item) => {
    nodes.push({ type: "item", id: item.id, name: item.name, depth: depth + 1, obj: item });
  });
  section.children.forEach((child) => {
    nodes.push(...flattenNodes(child, depth + 1));
  });
  return nodes;
};

const collectItemFields = (section, fieldsSet) => {
  section.items.forEach((item) => {
    // Only text and image items have fieldId
    if (item.fieldId && (!item.type || item.type === "text" || item.type === "image")) {
      fieldsSet.add(item.fieldId);
    }
  });
  section.children.forEach((child) => collectItemFields(child, fieldsSet));
};

const collectItemFieldsWithTypes = (section, fieldsMap) => {
  section.items.forEach((item) => {
    // Only text and image items have fieldId
    if (item.fieldId && (!item.type || item.type === "text" || item.type === "image")) {
      const type = item.type ?? "text";
      fieldsMap.set(item.fieldId, type);
    }
  });
  section.children.forEach((child) => collectItemFieldsWithTypes(child, fieldsMap));
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

const findSectionByItemsList = (section, targetList) => {
  if (section.items === targetList) return section;
  for (const child of section.children) {
    const found = findSectionByItemsList(child, targetList);
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

const buildParentSectionOptions = (excludeSectionId) => {
  const options = [];
  const collectSections = (section, depth = 0) => {
    // Don't include the section itself or any of its descendants
    if (excludeSectionId && section.id === excludeSectionId) {
      return; // Skip this section and all its children
    }
    
    options.push({ 
      value: section.id, 
      label: `${"  ".repeat(depth)}${section.name}` 
    });
    
    for (const child of section.children) {
      collectSections(child, depth + 1);
    }
  };
  
  collectSections(state.template.root);
  return options;
};

const findParentSection = (section, targetId, isSection) => {
  if (isSection) {
    // For sections, find the parent that contains this section in its children
    const index = section.children.findIndex((child) => child.id === targetId);
    if (index >= 0) {
      return section;
    }
    for (const child of section.children) {
      const found = findParentSection(child, targetId, true);
      if (found) return found;
    }
  } else {
    // For items, find the parent that contains this item in its items
    const index = section.items.findIndex((item) => item.id === targetId);
    if (index >= 0) {
      return section;
    }
    for (const child of section.children) {
      const found = findParentSection(child, targetId, false);
      if (found) return found;
    }
  }
  return null;
};

const reparentNode = (nodeId, nodeType, newParentId) => {
  if (!newParentId) return false;
  
  // Find the node and its current location
  const location = findNodeLocation(state.template.root, { type: nodeType, id: nodeId });
  if (!location) return false;
  
  // Find the new parent section
  const newParent = findSectionById(state.template.root, newParentId);
  if (!newParent) return false;
  
  // For sections, prevent reparenting to itself or its descendants
  if (nodeType === "section") {
    const node = findSectionById(state.template.root, nodeId);
    if (!node) return false;
    
    // Check if newParent is the node itself or a descendant
    const isDescendant = (parent, childId) => {
      if (parent.id === childId) return true;
      for (const child of parent.children) {
        if (isDescendant(child, childId)) return true;
      }
      return false;
    };
    
    if (isDescendant(node, newParentId)) {
      return false; // Can't reparent to self or descendant
    }
  }
  
  // Remove from current parent
  const [movedNode] = location.list.splice(location.index, 1);
  
  // Add to new parent
  if (nodeType === "section") {
    newParent.children.push(movedNode);
  } else {
    newParent.items.push(movedNode);
    // Update attach target if it was pointing to the old parent
    const oldParent = findParentSection(state.template.root, nodeId, false);
    if (movedNode.attach && movedNode.attach.targetId === oldParent?.id) {
      movedNode.attach.targetId = newParentId;
    }
  }
  
  return true;
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

const connectDrive = async () => {
  try {
    if (!storage) throw new Error("Storage not ready.");
    await storage.signIn();
    syncAuthUi();
    await loadGame();
    setStatus("Connected to Google Drive.");
  } catch (err) {
    setStatus(`Sign-in failed: ${err.message}`);
  }
};

const disconnectDrive = async () => {
  if (!storage) return;
  await storage.signOut();
  syncAuthUi();
  state.currentGame = null;
  state.cards = [];
  state.currentCard = null;
  state.template = null;
  currentGameEl.textContent = "Disconnected";
  gameTitleEl.textContent = "Game Editor";
  gameMetaEl.textContent = "";
  cardsList.innerHTML = "<p class=\"empty\">Sign in to load cards.</p>";
  cardPreview.src = "";
  templatePreview.src = "";
  setStatus("Disconnected.");
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
itemTypeConfirm.addEventListener("click", confirmItemCreation);
itemTypeCancel.addEventListener("click", hideItemTypeModal);
// Close modal when clicking overlay
itemTypeModal.addEventListener("click", (event) => {
  if (event.target === itemTypeModal) {
    hideItemTypeModal();
  }
});
connectButton.addEventListener("click", connectDrive);
disconnectButton.addEventListener("click", disconnectDrive);
printLink.addEventListener("click", (event) => {
  event.preventDefault();
  openPrintView();
});
cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCard();
});

// Use event delegation for automatic preview updates on all form inputs
cardForm.addEventListener("input", (event) => {
  const target = event.target;
  // Check if the input is the name field
  if (target === fields.name) {
    autoUpdatePreview();
  }
});

bindControlEvents();
bindCardFieldEvents();
const boot = async () => {
  try {
    storage = createStorage();
    await storage.init();
    const restored = await storage.tryRestoreSession();
    syncAuthUi();
    if (restored) {
      await loadGame();
    } else {
      setStatus("Connect to Google Drive to load this game.");
    }
  } catch (err) {
    setStatus(`Storage init failed: ${err.message}`);
  }
};

boot();
