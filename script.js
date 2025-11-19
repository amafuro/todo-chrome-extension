// データ構造
let appData = {
  sections: []
};

// 現在編集中のTODO
let currentEditingTodo = null;

// ドラッグ中の要素
let draggedElement = null;
let draggedData = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderSections();
  initEventListeners();
  checkIfOpenedInTab();
});

// イベントリスナーの初期化
function initEventListeners() {
  document.getElementById('addSectionBtn').addEventListener('click', addSection);
  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('ganttChartBtn').addEventListener('click', openGanttChart);
  document.getElementById('closeGanttBtn').addEventListener('click', closeGanttChart);
  
  // タブで開くボタン
  const openInTabBtn = document.getElementById('openInTabBtn');
  if (openInTabBtn) {
    openInTabBtn.addEventListener('click', openInTab);
  }
  
  // モーダル外クリックで閉じる
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') {
      closeEditModal();
    }
  });
  
  document.getElementById('ganttModal').addEventListener('click', (e) => {
    if (e.target.id === 'ganttModal') {
      closeGanttChart();
    }
  });
}

// タブで開く
function openInTab() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html')
  });
}

// タブで開かれているかチェック
function checkIfOpenedInTab() {
  // ポップアップとして開かれている場合、window.location.search は空
  // タブとして開かれている場合も同じだが、chrome.extension.getViews()で判定可能
  
  // より簡単な方法：URLパラメータで判定
  const urlParams = new URLSearchParams(window.location.search);
  const isTab = urlParams.get('tab') === 'true' || window.location.pathname.includes('popup.html');
  
  // タブとして開かれている場合、bodyのサイズを調整
  if (window.innerWidth > 850 || window.innerHeight > 750) {
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';
    document.body.style.maxWidth = '1200px';
    document.body.style.margin = '0 auto';
    
    // ボタンのテキストを変更
    const openInTabBtn = document.getElementById('openInTabBtn');
    if (openInTabBtn) {
      openInTabBtn.textContent = '✓ タブ表示中';
      openInTabBtn.disabled = true;
      openInTabBtn.style.opacity = '0.6';
      openInTabBtn.style.cursor = 'default';
    }
  }
}

// データの読み込み
async function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['todoData'], (result) => {
      if (result.todoData) {
        appData = result.todoData;
      } else {
        // 初期データ
        appData = {
          sections: [
            {
              id: generateId(),
              title: '個人タスク',
              todos: []
            }
          ]
        };
      }
      resolve();
    });
  });
}

// データの保存
async function saveData() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ todoData: appData }, () => {
      resolve();
    });
  });
}

// ユニークID生成
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// セクションの追加
function addSection() {
  const newSection = {
    id: generateId(),
    title: '',
    todos: []
  };
  appData.sections.push(newSection);
  saveData();
  renderSections();
}

// セクションの削除
function deleteSection(sectionId) {
  if (confirm('このセクションを削除してもよろしいですか？')) {
    appData.sections = appData.sections.filter(s => s.id !== sectionId);
    saveData();
    renderSections();
  }
}

// セクションのレンダリング
function renderSections() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';
  
  appData.sections.forEach(section => {
    const sectionEl = createSectionElement(section);
    container.appendChild(sectionEl);
  });
}

// セクション要素の作成
function createSectionElement(section) {
  const template = document.getElementById('sectionTemplate');
  const sectionEl = template.content.cloneNode(true).querySelector('.section');
  
  sectionEl.dataset.sectionId = section.id;
  
  const titleInput = sectionEl.querySelector('.section-title');
  titleInput.value = section.title;
  titleInput.addEventListener('input', (e) => {
    section.title = e.target.value;
    saveData();
  });
  
  const deleteBtn = sectionEl.querySelector('.delete-section');
  deleteBtn.addEventListener('click', () => deleteSection(section.id));
  
  const addTodoBtn = sectionEl.querySelector('.add-todo-btn');
  addTodoBtn.addEventListener('click', () => addTodo(section.id));
  
  const todosList = sectionEl.querySelector('.todos-list');
  section.todos.forEach(todo => {
    const todoEl = createTodoElement(todo, section.id);
    todosList.appendChild(todoEl);
  });
  
  // ドロップゾーンとして設定
  setupDropZone(todosList, section.id);
  
  // セクション全体もドロップ可能に
  setupSectionDropZone(sectionEl, section.id);
  
  return sectionEl;
}

// セクション全体をドロップゾーンとして設定
function setupSectionDropZone(sectionEl, sectionId) {
  sectionEl.addEventListener('dragover', (e) => {
    // ヘッダー部分でのドラッグオーバーを許可
    const target = e.target;
    if (target.classList.contains('section') || 
        target.classList.contains('section-header') ||
        target.closest('.section-header')) {
      e.preventDefault();
      sectionEl.classList.add('section-drag-over');
    }
  });
  
  sectionEl.addEventListener('dragleave', (e) => {
    if (!sectionEl.contains(e.relatedTarget)) {
      sectionEl.classList.remove('section-drag-over');
    }
  });
  
  sectionEl.addEventListener('drop', (e) => {
    const target = e.target;
    // ヘッダー部分にドロップされた場合のみ処理
    if (target.classList.contains('section-header') || 
        target.closest('.section-header')) {
      e.preventDefault();
      e.stopPropagation();
      
      sectionEl.classList.remove('section-drag-over');
      
      if (draggedData) {
        moveToRoot(draggedData, sectionId);
      }
    }
  });
}

// TODOの追加
function addTodo(sectionId, parentId = null) {
  const section = appData.sections.find(s => s.id === sectionId);
  if (!section) return;
  
  const newTodo = {
    id: generateId(),
    text: '',
    completed: false,
    children: [],
    dueDate: null,
    parentId: parentId
  };
  
  if (parentId) {
    // 親TODOの子として追加
    const parentTodo = findTodoById(section.todos, parentId);
    if (parentTodo) {
      parentTodo.children.push(newTodo);
    }
  } else {
    // ルートレベルに追加
    section.todos.push(newTodo);
  }
  
  saveData();
  renderSections();
  
  // 新しいTODOの入力欄にフォーカス
  setTimeout(() => {
    const todoEl = document.querySelector(`[data-todo-id="${newTodo.id}"]`);
    if (todoEl) {
      const editBtn = todoEl.querySelector('.edit-todo');
      editBtn.click();
    }
  }, 100);
}

// TODOの削除
function deleteTodo(sectionId, todoId) {
  const section = appData.sections.find(s => s.id === sectionId);
  if (!section) return;
  
  removeTodoById(section.todos, todoId);
  saveData();
  renderSections();
}

// TODOをIDで検索
function findTodoById(todos, id) {
  for (const todo of todos) {
    if (todo.id === id) return todo;
    const found = findTodoById(todo.children, id);
    if (found) return found;
  }
  return null;
}

// TODOをIDで削除
function removeTodoById(todos, id) {
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === id) {
      todos.splice(i, 1);
      return true;
    }
    if (removeTodoById(todos[i].children, id)) {
      return true;
    }
  }
  return false;
}

// TODO要素の作成
function createTodoElement(todo, sectionId, level = 0) {
  const template = document.getElementById('todoItemTemplate');
  const todoEl = template.content.cloneNode(true).querySelector('.todo-item');
  
  todoEl.dataset.todoId = todo.id;
  todoEl.dataset.sectionId = sectionId;
  todoEl.dataset.level = level;
  
  if (todo.completed) {
    todoEl.classList.add('completed');
  }
  
  const toggleBtn = todoEl.querySelector('.toggle-children');
  const checkbox = todoEl.querySelector('.todo-checkbox');
  const todoText = todoEl.querySelector('.todo-text');
  const dateInput = todoEl.querySelector('.todo-date');
  const makeChildBtn = todoEl.querySelector('.make-child');
  const addChildBtn = todoEl.querySelector('.add-child');
  const editBtn = todoEl.querySelector('.edit-todo');
  const deleteBtn = todoEl.querySelector('.delete-todo');
  const childrenContainer = todoEl.querySelector('.todo-children');
  
  // チェックボックス
  checkbox.checked = todo.completed;
  checkbox.addEventListener('change', (e) => {
    todo.completed = e.target.checked;
    if (todo.completed) {
      todoEl.classList.add('completed');
    } else {
      todoEl.classList.remove('completed');
    }
    saveData();
  });
  
  // テキスト表示（ハイパーリンク対応）
  todoText.innerHTML = linkify(todo.text);
  
  // 日付
  if (todo.dueDate) {
    dateInput.value = todo.dueDate;
    dateInput.classList.add('has-date');
    
    // ローカルタイムゾーンで今日の日付を取得
    const todayDate = new Date();
    const year = todayDate.getFullYear();
    const month = String(todayDate.getMonth() + 1).padStart(2, '0');
    const day = String(todayDate.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    if (todo.dueDate < today && !todo.completed) {
      dateInput.classList.add('overdue');
    }
  }
  
  dateInput.addEventListener('change', (e) => {
    todo.dueDate = e.target.value || null;
    if (todo.dueDate) {
      e.target.classList.add('has-date');
    } else {
      e.target.classList.remove('has-date');
    }
    saveData();
  });
  
  // サブタスクにする
  makeChildBtn.addEventListener('click', () => {
    makeChildOfPreviousTodo(sectionId, todo.id);
  });
  
  // 子TODOの追加
  addChildBtn.addEventListener('click', () => {
    addTodo(sectionId, todo.id);
  });
  
  // 編集
  editBtn.addEventListener('click', () => {
    openEditModal(todo, sectionId);
  });
  
  // 削除
  deleteBtn.addEventListener('click', () => {
    if (confirm('このTODOを削除してもよろしいですか？')) {
      deleteTodo(sectionId, todo.id);
    }
  });
  
  // 子TODOの表示
  if (todo.children && todo.children.length > 0) {
    toggleBtn.classList.remove('hidden');
    todo.children.forEach(childTodo => {
      const childEl = createTodoElement(childTodo, sectionId, level + 1);
      childrenContainer.appendChild(childEl);
    });
    
    toggleBtn.addEventListener('click', () => {
      const isExpanded = childrenContainer.style.display !== 'none';
      childrenContainer.style.display = isExpanded ? 'none' : 'block';
      toggleBtn.classList.toggle('expanded', !isExpanded);
    });
    
    // 初期状態で展開
    childrenContainer.style.display = 'block';
    toggleBtn.classList.add('expanded');
  } else {
    toggleBtn.classList.add('hidden');
  }
  
  // ドラッグ設定
  setupDraggable(todoEl, todo, sectionId);
  
  return todoEl;
}

// テキストをハイパーリンク化
function linkify(text) {
  if (!text) return '';
  
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlPattern, (url) => {
    return `<a href="${url}" target="_blank">${url}</a>`;
  });
}

// 編集モーダルを開く
function openEditModal(todo, sectionId) {
  currentEditingTodo = { todo, sectionId };
  const modal = document.getElementById('editModal');
  const textarea = document.getElementById('editTextarea');
  
  textarea.value = todo.text;
  modal.style.display = 'flex';
  textarea.focus();
}

// 編集を保存
function saveEdit() {
  if (!currentEditingTodo) return;
  
  const textarea = document.getElementById('editTextarea');
  const { todo, sectionId } = currentEditingTodo;
  
  todo.text = textarea.value;
  saveData();
  renderSections();
  closeEditModal();
}

// 編集モーダルを閉じる
function closeEditModal() {
  // タスク名が空の場合はタスクを削除
  if (currentEditingTodo) {
    const textarea = document.getElementById('editTextarea');
    const { todo, sectionId } = currentEditingTodo;
    
    if (!textarea.value.trim()) {
      // タスク名が空の場合は削除
      deleteTodo(sectionId, todo.id);
    }
  }
  
  const modal = document.getElementById('editModal');
  modal.style.display = 'none';
  currentEditingTodo = null;
}

// ドラッグ可能にする
function setupDraggable(todoEl, todo, sectionId) {
  const todoMain = todoEl.querySelector('.todo-main');
  
  todoMain.addEventListener('dragstart', (e) => {
    draggedElement = todoEl;
    draggedData = { todo, sectionId };
    todoEl.classList.add('dragging');
    
    // ドラッグ時のゴーストイメージを設定
    e.dataTransfer.effectAllowed = 'move';
  });
  
  todoMain.addEventListener('dragend', (e) => {
    todoEl.classList.remove('dragging');
    document.querySelectorAll('.drag-over-top').forEach(el => {
      el.classList.remove('drag-over-top');
    });
    document.querySelectorAll('.drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-bottom');
    });
    draggedElement = null;
    draggedData = null;
  });
  
  todoMain.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation(); // イベント伝播を停止して、親要素のdragoverイベントとの干渉を防ぐ
    
    if (draggedElement && draggedElement !== todoEl && draggedData) {
      // 自分自身の子孫にはドロップできない
      if (!isDescendant(draggedData.todo, todo)) {
        // 他のTODOのドラッグオーバー状態をクリア
        document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
          if (el !== todoMain) {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
          }
        });
        
        // マウスの位置に基づいて、上半分か下半分かを判定
        const rect = todoMain.getBoundingClientRect();
        const mouseY = e.clientY;
        const elementMiddle = rect.top + rect.height / 2;
        
        todoMain.classList.remove('drag-over-top', 'drag-over-bottom');
        
        if (mouseY < elementMiddle) {
          todoMain.classList.add('drag-over-top');
        } else {
          todoMain.classList.add('drag-over-bottom');
        }
      }
    }
  });
  
  todoMain.addEventListener('dragleave', (e) => {
    // relatedTargetをチェックして、実際に要素から離れた場合のみクラスを削除
    // todoMain内の子要素への移動の場合は削除しない
    const relatedTarget = e.relatedTarget;
    if (!todoMain.contains(relatedTarget)) {
      todoMain.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });
  
  todoMain.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation(); // イベント伝播を停止
    
    const isTop = todoMain.classList.contains('drag-over-top');
    todoMain.classList.remove('drag-over-top', 'drag-over-bottom');
    
    // すべてのドラッグオーバー状態をクリア
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    if (draggedElement && draggedElement !== todoEl && draggedData) {
      // 自分自身の子孫にはドロップできない
      if (!isDescendant(draggedData.todo, todo)) {
        moveTodo(draggedData, todo, sectionId, isTop);
      }
    }
  });
}

// ドロップゾーンの設定（セクションの空白部分）
function setupDropZone(todosList, sectionId) {
  todosList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedData) {
      todosList.classList.add('drop-zone-active');
    }
  });
  
  todosList.addEventListener('dragleave', (e) => {
    // 子要素への移動でないことを確認
    if (!todosList.contains(e.relatedTarget)) {
      todosList.classList.remove('drop-zone-active');
    }
  });
  
  todosList.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    todosList.classList.remove('drop-zone-active');
    
    if (draggedData) {
      // TODOが既に存在するかチェック
      const existingTodos = todosList.querySelectorAll('.todo-item');
      let droppedOnTodo = false;
      
      // TODOの上にドロップされていない場合のみ、セクションのルートレベルに移動
      existingTodos.forEach(todoEl => {
        const rect = todoEl.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          droppedOnTodo = true;
        }
      });
      
      if (!droppedOnTodo) {
        moveToRoot(draggedData, sectionId);
      }
    }
  });
}

// TODOを移動
function moveTodo(draggedData, targetTodo, targetSectionId, insertBefore) {
  const { todo: draggedTodo, sectionId: sourceSectionId } = draggedData;
  
  const sourceSection = appData.sections.find(s => s.id === sourceSectionId);
  const targetSection = appData.sections.find(s => s.id === targetSectionId);
  
  if (!sourceSection || !targetSection) return;
  
  // ドラッグ元とターゲットの情報を取得
  const draggedInfo = findTodoInfo(sourceSection.todos, draggedTodo.id);
  const targetInfo = findTodoInfo(targetSection.todos, targetTodo.id);
  
  if (!draggedInfo || !targetInfo) return;
  
  // 同じ位置への移動はスキップ
  if (draggedInfo.array === targetInfo.array) {
    const draggedIdx = draggedInfo.array.findIndex(t => t.id === draggedTodo.id);
    const targetIdx = targetInfo.array.findIndex(t => t.id === targetTodo.id);
    
    if (draggedIdx === targetIdx || 
        (insertBefore && draggedIdx === targetIdx - 1) ||
        (!insertBefore && draggedIdx === targetIdx + 1)) {
      return; // 既に正しい位置にある
    }
  }
  
  // 元の場所から削除
  const draggedIndex = draggedInfo.array.findIndex(t => t.id === draggedTodo.id);
  draggedInfo.array.splice(draggedIndex, 1);
  
  // 新しい位置に挿入
  let targetIndex = targetInfo.array.findIndex(t => t.id === targetTodo.id);
  
  // 同じ配列内での移動で、削除によってインデックスがずれる場合の調整
  if (draggedInfo.array === targetInfo.array && draggedIndex < targetIndex) {
    targetIndex--;
  }
  
  // insertBeforeがfalseの場合は、ターゲットの後ろに挿入
  if (!insertBefore) {
    targetIndex++;
  }
  
  targetInfo.array.splice(targetIndex, 0, draggedTodo);
  
  saveData();
  renderSections();
}

// TODOの情報（親配列と親TODO）を取得
function findTodoInfo(todos, todoId, parent = null) {
  for (let i = 0; i < todos.length; i++) {
    const todo = todos[i];
    if (todo.id === todoId) {
      return {
        todo: todo,
        array: todos,
        parent: parent,
        index: i
      };
    }
    
    if (todo.children && todo.children.length > 0) {
      const found = findTodoInfo(todo.children, todoId, todo);
      if (found) return found;
    }
  }
  return null;
}

// ルートレベルに移動
function moveToRoot(draggedData, targetSectionId) {
  const { todo: draggedTodo, sectionId: sourceSectionId } = draggedData;
  
  // 元の場所から削除
  const sourceSection = appData.sections.find(s => s.id === sourceSectionId);
  if (sourceSection) {
    removeTodoById(sourceSection.todos, draggedTodo.id);
  }
  
  // ターゲットセクションのルートに追加
  const targetSection = appData.sections.find(s => s.id === targetSectionId);
  if (targetSection) {
    targetSection.todos.push(draggedTodo);
  }
  
  saveData();
  renderSections();
}

// 親TODOを検索
function findParentTodo(todos, childId, parent = null) {
  for (const todo of todos) {
    if (todo.id === childId) {
      return parent;
    }
    const found = findParentTodo(todo.children, childId, todo);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

// 子孫かどうかチェック
function isDescendant(ancestor, descendant) {
  if (ancestor.id === descendant.id) return true;
  
  for (const child of ancestor.children || []) {
    if (isDescendant(child, descendant)) {
      return true;
    }
  }
  
  return false;
}

// サブタスクにする
function makeChildOfPreviousTodo(sectionId, todoId) {
  const section = appData.sections.find(s => s.id === sectionId);
  if (!section) return;
  
  // 対象のTODOとその情報を取得
  const todoInfo = findTodoInfo(section.todos, todoId);
  if (!todoInfo) return;
  
  const { todo, array, index } = todoInfo;
  
  // 配列の最初の要素の場合、上のタスクが存在しないため何もしない
  if (index === 0) {
    alert('上にタスクが存在しません');
    return;
  }
  
  // 上のタスクを取得
  const previousTodo = array[index - 1];
  
  // 現在のタスクを配列から削除
  array.splice(index, 1);
  
  // 上のタスクのサブタスクとして追加
  if (!previousTodo.children) {
    previousTodo.children = [];
  }
  previousTodo.children.push(todo);
  
  saveData();
  renderSections();
}

// ガントチャートを開く
function openGanttChart() {
  const modal = document.getElementById('ganttModal');
  modal.style.display = 'flex';
  renderGanttChart();
}

// ガントチャートを閉じる
function closeGanttChart() {
  const modal = document.getElementById('ganttModal');
  modal.style.display = 'none';
}

// ガントチャートをレンダリング
function renderGanttChart() {
  const container = document.getElementById('ganttChart');
  
  // 全てのタスクを収集（期限のないものは今日として扱う）
  const tasksWithDates = [];
  
  appData.sections.forEach(section => {
    const sectionTasks = collectTasksWithDates(section.todos, section.title, section.id);
    tasksWithDates.push(...sectionTasks);
  });
  
  if (tasksWithDates.length === 0) {
    container.innerHTML = '<div class="gantt-empty-message">タスクがありません。</div>';
    return;
  }
  
  // 日付範囲を計算
  const dates = tasksWithDates.map(t => new Date(t.dueDate));
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);  // 時刻をリセット
  // ローカルタイムゾーンで今日の日付を取得
  const year = todayDate.getFullYear();
  const month = String(todayDate.getMonth() + 1).padStart(2, '0');
  const day = String(todayDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;  // YYYY-MM-DD形式
  
  const minTaskDate = new Date(Math.min(...dates));
  const maxTaskDate = new Date(Math.max(...dates));
  
  // 表示範囲：タスクの最小日付から最大日付の7日後まで
  const minDate = new Date(minTaskDate);
  minDate.setDate(minDate.getDate());
  const maxDate = new Date(maxTaskDate);
  maxDate.setDate(maxDate.getDate() + 7);
  
  // 日付の配列を作成
  const dateRange = [];
  const currentDate = new Date(minDate);
  while (currentDate <= maxDate) {
    dateRange.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // 今日の日付のインデックスを計算（後でスクロール位置に使用）
  const todayIndex = dateRange.findIndex(d => d.toISOString().split('T')[0] === today);
  
  // ガントチャートHTML作成
  const timeline = document.createElement('div');
  timeline.className = 'gantt-timeline';
  
  // ヘッダー行
  const headerRow = document.createElement('div');
  headerRow.className = 'gantt-header-row';
  
  const taskLabel = document.createElement('div');
  taskLabel.className = 'gantt-task-label';
  taskLabel.textContent = 'タスク';
  headerRow.appendChild(taskLabel);
  
  const datesContainer = document.createElement('div');
  datesContainer.className = 'gantt-dates';
  dateRange.forEach(date => {
    const dateStr = date.toISOString().split('T')[0];
    const isToday = dateStr === today;
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    const formattedDate = `${date.getMonth() + 1}/${date.getDate()}\n${dayOfWeek}`;
    
    const dateCell = document.createElement('div');
    dateCell.className = `gantt-date-cell ${isToday ? 'today' : ''}`;
    dateCell.innerHTML = formattedDate.replace('\n', '<br>');
    datesContainer.appendChild(dateCell);
  });
  headerRow.appendChild(datesContainer);
  timeline.appendChild(headerRow);
  
  // セクションごとにタスクを表示
  let lastSection = '';
  tasksWithDates.forEach((task, taskIndex) => {
    // セクションヘッダー
    if (task.section !== lastSection) {
      const sectionRow = document.createElement('div');
      sectionRow.className = 'gantt-section-row';
      
      // セクション名（左側固定）
      const sectionLabel = document.createElement('div');
      sectionLabel.className = 'gantt-section-label';
      sectionLabel.textContent = task.section || '(無題のセクション)';
      sectionRow.appendChild(sectionLabel);
      
      // セクションヘッダーの右側（スクロールする部分）
      const sectionDateArea = document.createElement('div');
      sectionDateArea.className = 'gantt-section-date-area';
      sectionRow.appendChild(sectionDateArea);
      
      timeline.appendChild(sectionRow);
      lastSection = task.section;
    }
    
    // タスク行
    const row = document.createElement('div');
    row.className = 'gantt-row';
    
    // タスク名
    const taskName = document.createElement('div');
    taskName.className = 'gantt-task-name';
    if (task.completed) taskName.classList.add('completed');
    if (task.isChild) taskName.classList.add('child-task');
    taskName.textContent = task.text || '(無題のタスク)';
    row.appendChild(taskName);
    
    // タスクバー
    const barsContainer = document.createElement('div');
    barsContainer.className = 'gantt-bars';
    
    // グリッド
    const grid = document.createElement('div');
    grid.className = 'gantt-grid';
    dateRange.forEach(date => {
      const dateStr = date.toISOString().split('T')[0];
      const isToday = dateStr === today;
      
      const gridCell = document.createElement('div');
      gridCell.className = `gantt-grid-cell ${isToday ? 'today' : ''}`;
      gridCell.dataset.date = dateStr;
      
      // ドロップゾーンとして設定
      gridCell.addEventListener('dragover', (e) => {
        e.preventDefault();
        gridCell.classList.add('drag-over');
      });
      
      gridCell.addEventListener('dragleave', (e) => {
        gridCell.classList.remove('drag-over');
      });
      
      gridCell.addEventListener('drop', (e) => {
        e.preventDefault();
        gridCell.classList.remove('drag-over');
        
        const taskId = e.dataTransfer.getData('taskId');
        const sectionId = e.dataTransfer.getData('sectionId');
        const newDate = gridCell.dataset.date;
        
        if (taskId && sectionId && newDate) {
          updateTaskDueDateFromGantt(sectionId, taskId, newDate);
        }
      });
      
      grid.appendChild(gridCell);
    });
    barsContainer.appendChild(grid);
    
    // バーの位置と幅を計算
    const taskDate = new Date(task.dueDate);
    const dayIndex = dateRange.findIndex(d => d.toDateString() === taskDate.toDateString());
    
    if (dayIndex !== -1) {
      const barLeft = dayIndex * 60;
      const barWidth = 58;
      
      const bar = document.createElement('div');
      bar.className = 'gantt-bar';
      if (task.completed) bar.classList.add('completed');
      else if (task.dueDate < today) bar.classList.add('overdue');
      
      bar.style.left = `${barLeft}px`;
      bar.style.width = `${barWidth}px`;
      bar.textContent = task.text || '(無題のタスク)';
      bar.title = `${task.text || '(無題のタスク)'} - ${task.dueDate}`;
      bar.draggable = true;
      
      // ドラッグ可能に設定
      bar.dataset.taskId = task.id;
      bar.dataset.sectionId = task.sectionId;
      bar.dataset.dateIndex = dayIndex;
      
      bar.addEventListener('dragstart', (e) => {
        bar.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.setData('sectionId', task.sectionId);
      });
      
      bar.addEventListener('dragend', (e) => {
        bar.classList.remove('dragging');
        // すべてのドラッグオーバー状態をクリア
        document.querySelectorAll('.gantt-grid-cell.drag-over').forEach(cell => {
          cell.classList.remove('drag-over');
        });
      });
      
      barsContainer.appendChild(bar);
    }
    
    row.appendChild(barsContainer);
    timeline.appendChild(row);
  });
  
  container.innerHTML = '';
  container.appendChild(timeline);
  
  // 今日の日付が見える位置にスクロール
  if (todayIndex !== -1) {
    // 各日付セルの幅は60px
    const scrollPosition = todayIndex * 60;
    // ガントチャートのdatesコンテナを取得してスクロール
    setTimeout(() => {
      const datesContainers = document.querySelectorAll('.gantt-dates');
      const barsContainers = document.querySelectorAll('.gantt-bars');
      datesContainers.forEach(container => {
        container.scrollLeft = scrollPosition;
      });
      barsContainers.forEach(container => {
        container.scrollLeft = scrollPosition;
      });
    }, 0);
  }
}

// ガントチャートからタスクの期限日を更新
function updateTaskDueDateFromGantt(sectionId, taskId, newDate) {
  const section = appData.sections.find(s => s.id === sectionId);
  if (!section) return;
  
  // タスクを検索
  const task = findTodoById(section.todos, taskId);
  if (!task) return;
  
  // 期限日を更新
  task.dueDate = newDate;
  
  // データを保存
  saveData();
  
  // メインのタスクリストを再レンダリング
  renderSections();
  
  // ガントチャートも再レンダリング
  renderGanttChart();
}

// 期限のあるタスクを再帰的に収集
function collectTasksWithDates(todos, sectionTitle, sectionId, isChild = false) {
  const tasks = [];
  // ローカルタイムゾーンで今日の日付を取得
  const todayDate = new Date();
  const year = todayDate.getFullYear();
  const month = String(todayDate.getMonth() + 1).padStart(2, '0');
  const day = String(todayDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  todos.forEach(todo => {
    // 期限日が設定されていない場合は今日の日付を使用
    const dueDate = todo.dueDate || today;
    
    tasks.push({
      id: todo.id,
      text: todo.text,
      dueDate: dueDate,
      completed: todo.completed,
      section: sectionTitle,
      sectionId: sectionId,
      isChild: isChild,
      hasNoDueDate: !todo.dueDate  // 期限日が元々設定されていなかったかを記録
    });
    
    // 子タスクも収集
    if (todo.children && todo.children.length > 0) {
      tasks.push(...collectTasksWithDates(todo.children, sectionTitle, sectionId, true));
    }
  });
  
  return tasks;
}

