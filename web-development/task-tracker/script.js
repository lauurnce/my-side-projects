const taskInput = document.getElementById('taskInput');
const addButton = document.getElementById('addButton');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const questCount = document.getElementById('questCount');
const levelText = document.getElementById('levelText');
const xpFill = document.getElementById('xpFill');
const xpText = document.getElementById('xpText');
const resetButton = document.getElementById('resetButton');
const toast = document.getElementById('toast');

const XP_PER_QUEST = 25;
const XP_PER_LEVEL = 100;
const SAVE_KEY = 'quest-log';

let game = loadGame();
let toastTimer;

function loadGame() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || { quests: [], xp: 0 };
  } catch {
    return { quests: [], xp: 0 };
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch {}
}

function levelOf(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function showToast(message, isLevelUp) {
  toast.textContent = message;
  toast.classList.toggle('level-up', isLevelUp);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
}

function buildQuest(quest, isFresh) {
  const item = document.createElement('li');
  item.className = 'quest';
  item.dataset.id = quest.id;
  item.classList.toggle('done', quest.done);
  item.classList.toggle('fresh', isFresh);

  const check = document.createElement('button');
  check.className = 'check';
  check.dataset.action = 'toggle';
  check.textContent = quest.done ? '✓' : '▸';

  const text = document.createElement('span');
  text.className = 'quest-text';
  text.dataset.action = 'toggle';
  text.textContent = quest.text;

  const reward = document.createElement('span');
  reward.className = 'reward';
  reward.textContent = `+${XP_PER_QUEST} XP`;

  const abandon = document.createElement('button');
  abandon.className = 'abandon';
  abandon.dataset.action = 'abandon';
  abandon.textContent = 'Abandon';

  item.append(check, text, reward, abandon);
  return item;
}

function render(freshId) {
  taskList.replaceChildren(...game.quests.map((quest) => buildQuest(quest, quest.id === freshId)));

  const done = game.quests.filter((quest) => quest.done).length;
  questCount.textContent = `${game.quests.length - done} active · ${done} done`;
  emptyState.hidden = game.quests.length > 0;

  const progress = game.xp % XP_PER_LEVEL;
  levelText.textContent = `LV ${levelOf(game.xp)}`;
  xpFill.style.width = `${progress}%`;
  xpText.textContent = `${progress} / ${XP_PER_LEVEL} XP`;
}

function addQuest() {
  const text = taskInput.value.trim();

  if (text === '') {
    taskInput.classList.remove('shake');
    void taskInput.offsetWidth;
    taskInput.classList.add('shake');
    return;
  }

  const quest = { id: Date.now(), text, done: false };
  game.quests.push(quest);
  taskInput.value = '';
  taskInput.focus();
  saveGame();
  render(quest.id);
}

function toggleQuest(id) {
  const quest = game.quests.find((q) => q.id === id);
  const levelBefore = levelOf(game.xp);

  quest.done = !quest.done;
  game.xp = Math.max(0, game.xp + (quest.done ? XP_PER_QUEST : -XP_PER_QUEST));
  saveGame();
  render();

  if (!quest.done) return;
  if (levelOf(game.xp) > levelBefore) {
    showToast(`Level up! LV ${levelOf(game.xp)}`, true);
    return;
  }
  showToast(`Quest complete +${XP_PER_QUEST} XP`, false);
}

function abandonQuest(id, item) {
  item.classList.add('abandoning');
  item.addEventListener('animationend', () => {
    game.quests = game.quests.filter((q) => q.id !== id);
    saveGame();
    render();
  }, { once: true });
}

function newGame() {
  game = { quests: [], xp: 0 };
  saveGame();
  render();
  taskInput.focus();
}

addButton.addEventListener('click', addQuest);

taskInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addQuest();
});

taskInput.addEventListener('animationend', () => taskInput.classList.remove('shake'));

taskList.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  if (!action) return;

  const item = event.target.closest('.quest');
  const id = Number(item.dataset.id);

  if (action === 'toggle') toggleQuest(id);
  if (action === 'abandon') abandonQuest(id, item);
});

resetButton.addEventListener('click', newGame);

render();
