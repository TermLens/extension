// 분석 결과를 표시하는 모달 UI

if (typeof window.termLensUi === 'undefined') {
  window.termLensUi = (function () {
    const MODAL_ID = 'tos-analyzer-modal-container';
    const OVERLAY_ID = 'tos-analyzer-overlay';

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getIconUrl(evalType) {
      const name = evalType === 'good' ? 'good.png' : evalType === 'bad' ? 'bad.png' : 'neutral.png';
      return chrome.runtime.getURL(`icons/${name}`);
    }

    function gradeClass(grade) {
      if (['A', 'B'].includes(grade)) return 'grade-good';
      if (['C'].includes(grade)) return 'grade-neutral';
      return 'grade-bad';
    }

    function countEvaluations(clauses = []) {
      return clauses.reduce(
        (acc, clause) => {
          const key = (clause?.evaluation || '').toLowerCase();
          if (key === 'good' || key === 'neutral' || key === 'bad') {
            acc[key] += 1;
          }
          return acc;
        },
        { good: 0, neutral: 0, bad: 0 }
      );
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
      const safeGrade = escapeHtml(grade);
      const clauses = data.evaluation_for_each_clause || [];
      const counts = countEvaluations(clauses);

      const distribution = `
        <div class="tos-distribution" role="list" aria-label="조항 평가 분포">
          ${['good', 'neutral', 'bad']
            .map((type) => {
              const label = type === 'good' ? '좋음' : type === 'bad' ? '나쁨' : '중립';
              return `
                <div class="tos-distribution-item ${type}" role="listitem">
                  <div class="tos-distribution-icon">
                    <img src="${getIconUrl(type)}" alt="${label}" />
                  </div>
                  <div class="tos-distribution-info">
                    <span class="tos-distribution-label">${label}</span>
                    <span class="tos-distribution-count">${counts[type]}개</span>
                  </div>
                </div>`;
            })
            .join('')}
        </div>`;
      const list = clauses.length
        ? clauses.map((c, idx) => {
            const category = escapeHtml(c.category || '카테고리 미제공');
            const reasoning = escapeHtml(c.reasoning || '추가 설명이 없습니다.');
            const summary = escapeHtml(c.summarized_clause || '요약이 제공되지 않았습니다.');
            const reasonId = `tos-reason-${idx}`;
            return `
              <li class="tos-clause-item">
                <img src="${getIconUrl(c.evaluation)}" class="tos-clause-icon" />
                <div class="tos-clause-content">
                  <div class="tos-clause-top">
                    <span class="tos-category-badge">${category}</span>
                    <div class="tos-reason" aria-labelledby="${reasonId}">
                      <button class="tos-reason-btn" type="button" aria-expanded="false" aria-controls="${reasonId}">
                        평가 근거
                      </button>
                      <div class="tos-reason-popover" id="${reasonId}" role="tooltip">
                        ${reasoning}
                      </div>
                    </div>
                  </div>
                  <p class="tos-clause-summary">${summary}</p>
                </div>
              </li>`;
          }).join('')
        : '<li class="tos-clause-item empty">분석된 조항이 없습니다.</li>';

      m.innerHTML = `
        <div class="tos-analyzer-modal">
          <div class="tos-analyzer-header">
            <h3>약관 분석 결과</h3>
            <button class="tos-close-btn" id="close-btn">&times;</button>
          </div>
          <div class="tos-analyzer-body">
            <div class="tos-overall-section">
              <div class="tos-overall-head">
                <h4>종합 평가</h4>
              </div>
              <div class="tos-overall-wrap">
                <div class="tos-overall-grade ${gradeClass(grade)}">${safeGrade}</div>
                ${distribution}
              </div>
            </div>
            <div class="tos-clauses-section">
              <h4>주요 조항 요약</h4>
              <ul class="tos-clauses-list">${list}</ul>
            </div>
          </div>
        </div>`;
      document.getElementById('close-btn').onclick = removeModal;

      m.querySelectorAll('.tos-reason-btn').forEach(btn => {
        const wrapper = btn.closest('.tos-reason');
        if (!wrapper) return;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = wrapper.classList.toggle('open');
          btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        btn.addEventListener('blur', () => {
          wrapper.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        });
        btn.addEventListener('mouseenter', () => wrapper.classList.add('open'));
        btn.addEventListener('mouseleave', () => wrapper.classList.remove('open'));
      });
    }

    return { MODAL_ID, showLoadingModal, showResultsModal, showError, removeModal };
  })();
}
