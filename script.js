function openLibrary() {
  renderLibrary();
  goTo('library');
}

function openEditQuiz() {
  const lib = getLibrary().sort((a, b) => b.updatedAt - a.updatedAt);
  if (lib.length) {
    openLibraryQuiz(lib[0].id);
    return;
  }
  startNewQuiz();
}

function renderLibrary() {
  const list = document.getElementById('lib-list');
  const lib = getLibrary().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!lib.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><div>No saved quizzes yet.</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="startNewQuiz()">+ Create Your First Quiz</button></div></div>';
    return;
  }
  list.innerHTML = lib.map(item => `
    <div class="lib-card">
      <div class="lib-info">
        <div class="lib-title">${escHtml(item.title)}</div>
        <div class="lib-meta">${item.questionCount} question${item.questionCount === 1 ? '' : 's'} · edited ${new Date(item.updatedAt).toLocaleString()}</div>
      </div>
      <div class="lib-actions">
        <button class="btn btn-primary btn-sm" onclick="openLibraryQuiz('${item.id}')">Open</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLibraryQuiz('${item.id}')">Delete</button>
      </div>
    </div>`).join('');
}
