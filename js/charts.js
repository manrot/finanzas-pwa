let chartInstance = null;

function loadChart() {
  if (!selectedAccountId) return;
  const tx = db.transaction("transactions", "readonly").objectStore("transactions").index("accountId").getAll(selectedAccountId);
  tx.onsuccess = (e) => {
    const data = e.target.result;
    const counts = {};
    data.forEach(t => counts[t.type] = (counts[t.type] || 0) + t.amount);

    const ctx = document.getElementById('chartCanvas').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(counts),
        datasets: [{ data: Object.values(counts), backgroundColor: ['#0d6efd','#dc3545','#198754','#ffc107','#6f42c1'] }]
      },
      options: { responsive: true }
    });
  };
}
