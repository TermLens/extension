// 분석 결과를 표시하는 모달 UI

if (typeof window.termLensUi === 'undefined') {
  window.termLensUi = (function () {
    const MODAL_ID = 'tos-analyzer-modal-container';
    const OVERLAY_ID = 'tos-analyzer-overlay';

    function getIconUrl(evalType) {
      const name = evalType === 'good' ? 'good.png' : evalType === 'bad' ? 'bad.png' : 'neutral.png';
      return chrome.runtime.getURL(`icons/${name}`);
    }

    function gradeClass(grade) {
      if (['A', 'B'].includes(grade)) return 'grade-good';
      if (['C'].includes(grade)) return 'grade-neutral';
      return 'grade-bad';
    }

    function createContainer() {
      const overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.onclick = removeModal;
      document.body.appendChild(overlay);

      const modal = document.createElement('div');
      modal.id = MODAL_ID;
      document.body.appendChild(modal);
      return modal;
    }

    function removeModal() {
      document.getElementById(MODAL_ID)?.remove();
      document.getElementById(OVERLAY_ID)?.remove();
    }

    function showLoadingModal() {
      const m = createContainer();
      m.innerHTML = `
        <div class="tos-analyzer-modal">
          <div class="tos-analyzer-header"><h3>약관 분석 중...</h3></div>
          <div class="tos-analyzer-body"><div class="loader"></div><p>현재 페이지의 약관을 분석 중입니다.</p></div>
        </div>`;
    }

    function showError(msg) {
      const m = document.getElementById(MODAL_ID) || createContainer();
      m.innerHTML = `
        <div class="tos-analyzer-modal">
          <div class="tos-analyzer-header"><h3>분석 실패</h3><button class="tos-close-btn" id="close-btn">&times;</button></div>
          <div class="tos-analyzer-body error-body"><pre>${msg || '알 수 없는 오류'}</pre></div>
        </div>`;
      document.getElementById('close-btn').onclick = removeModal;
    }

    function showResultsModal(data) {
      const m = document.getElementById(MODAL_ID) || createContainer();
      const grade = data.overall_evaluation || 'N/A';
      const clauses = data.evaluation_for_each_clause || [];
      const list = clauses.length
        ? clauses.map(c => `
            <li class="tos-clause-item">
              <img src="${getIconUrl(c.evaluation)}" class="tos-clause-icon" />
              <p>${c.summarized_clause}</p>
            </li>`).join('')
        : '<li>분석된 조항이 없습니다.</li>';

      m.innerHTML = `
        <div class="tos-analyzer-modal">
          <div class="tos-analyzer-header">
            <h3>약관 분석 결과</h3>
            <button class="tos-close-btn" id="close-btn">&times;</button>
          </div>
          <div class="tos-analyzer-body">
            <div class="tos-overall-section">
              <h4>종합 평가</h4>
              <div class="tos-overall-grade ${gradeClass(grade)}">${grade}</div>
            </div>
            <div class="tos-clauses-section">
              <h4>주요 조항 요약</h4>
              <ul class="tos-clauses-list">${list}</ul>
            </div>
          </div>
        </div>`;
      document.getElementById('close-btn').onclick = removeModal;
    }

    return { MODAL_ID, showLoadingModal, showResultsModal, showError, removeModal };
  })();
}
