const LeaderboardModule = (() => {
  const API_BASE = '/api/leaderboard';
  const PER_PAGE = 5;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shortenWallet(address) {
    if (!address) return 'anonymous';
    if (address.length <= 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  function formatReward(total) {
    const n = Math.floor(total);
    if (n < 100) return n + '+';
    return Math.floor(n / 100) * 100 + '+';
  }

  function renderPagination(el, currentPage, totalPages, onChange) {
    if (totalPages <= 1) {
      el.innerHTML = totalPages === 1 ? '<div class="page-single">Page 1</div>' : '';
      return;
    }
    el.innerHTML = `
      <button class="page-btn page-prev"${currentPage <= 1 ? ' disabled' : ''}>&#9664; Prev</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button class="page-btn page-next"${currentPage >= totalPages ? ' disabled' : ''}>Next &#9654;</button>
    `;
    el.querySelector('.page-prev').addEventListener('click', () => {
      if (currentPage > 1) onChange(currentPage - 1);
    });
    el.querySelector('.page-next').addEventListener('click', () => {
      if (currentPage < totalPages) onChange(currentPage + 1);
    });
  }

  let allEntries = [];
  let currentPage = 1;

  function renderPage(page) {
    const tbody = document.getElementById('leaderboardBody');
    const pagination = document.getElementById('lbPagination');
    const totalPages = Math.ceil(allEntries.length / PER_PAGE) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    currentPage = page;

    const start = (page - 1) * PER_PAGE;
    const pageItems = allEntries.slice(start, start + PER_PAGE);

    if (!pageItems.length) {
      tbody.innerHTML = '<tr><td colspan="3">No rewards yet this week.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = pageItems
      .map((entry, index) => {
        const rank = start + index + 1;
        const cls = rank <= 3 ? ` class="rank-${rank}"` : '';
        return `<tr${cls}>
          <td>${rank}</td>
          <td>${esc(shortenWallet(entry.wallet))}</td>
          <td>${formatReward(entry.total)} RIDE</td>
        </tr>`;
      })
      .join('');

    if (pagination) renderPagination(pagination, page, totalPages, renderPage);
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      allEntries = await res.json();
      currentPage = 1;
      renderPage(1);
    } catch (err) {
      console.warn('Leaderboard load failed:', err.message);
      const tbody = document.getElementById('leaderboardBody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3">Unable to load leaderboard.</td></tr>';
    }
  }

  return { loadLeaderboard };
})();
