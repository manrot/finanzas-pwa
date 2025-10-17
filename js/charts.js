let chartInstance = null;

function loadChart() {
  const accountId = document.getElementById("chartAccountSelect").value;
  const fromDate = document.getElementById("chartFrom").value;
  const toDate = document.getElementById("chartTo").value;
  if (!accountId) return;

  const tx = db.transaction("transactions", "readonly").objectStore("transactions").index("accountId");
  tx.getAll(Number(accountId)).onsuccess = (e) => {
    const data = e.target.result.filter(t=>{
      const date = t.date.split("T")[0];
      if((fromDate && date<fromDate) || (toDate && date>toDate)) return false;
      return true;
    });

    const counts = {};
    data.forEach(t => counts[t.type] = (counts[t.type] || 0) + t.amount);

    const ctx = document.getElementById('balanceChart').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: ['#0d6efd','#dc3545','#198754','#ffc107','#6f42c1']
        }]
      },
      options: { responsive: true }
    });
  };
}
