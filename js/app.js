let db;
let selectedAccountId = null;

// Inicializar IndexedDB
const request = indexedDB.open("FinanzasDB", 1);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains("accounts")) db.createObjectStore("accounts", { keyPath: "id", autoIncrement: true });
  if (!db.objectStoreNames.contains("transactions")) {
    const store = db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
    store.createIndex("accountId", "accountId", { unique: false });
    store.createIndex("type", "type", { unique: false });
  }
  if (!db.objectStoreNames.contains("transactionTypes")) {
    const store = db.createObjectStore("transactionTypes", { keyPath: "type" });
    // Tipos iniciales
    ["entrada","salida","entrada prestamo","salida prestamo"].forEach(t => store.add({ type: t }));
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  loadAccounts();
  loadTransactionTypes();
};

request.onerror = (event) => console.log("Error DB:", event.target.error);

// DOM
const accountList = document.getElementById("accountList");
const addAccountBtn = document.getElementById("addAccountBtn");
const accountSelect = document.getElementById("accountSelect");
const typeSelect = document.getElementById("typeSelect");
const amountInput = document.getElementById("amount");
const descInput = document.getElementById("descInput");
const addTransactionBtn = document.getElementById("addTransactionBtn");
const transactionList = document.getElementById("transactionList");
const balanceSpan = document.getElementById("balance");
const transactionsMenuBtn = document.getElementById("transactionsMenuBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

// Función para cambiar sección
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.style.display = "none");
  document.getElementById(id + "Section").style.display = "block";
}

// ------------------- CUENTAS -------------------
function loadAccounts() {
  const tx = db.transaction("accounts", "readonly").objectStore("accounts");
  const request = tx.getAll();
  request.onsuccess = () => {
    accountList.innerHTML = "";
    accountSelect.innerHTML = "";
    request.result.forEach(acc => {
      const li = document.createElement("li");
      li.textContent = `${acc.name} - ${acc.description || ""} - Saldo: ${acc.balance || 0}`;
      const editBtn = document.createElement("button");
      editBtn.textContent = "Editar";
      editBtn.onclick = () => editAccount(acc.id);
      const delBtn = document.createElement("button");
      delBtn.textContent = "Borrar";
      delBtn.onclick = () => deleteAccount(acc.id);
      const viewBtn = document.createElement("button");
      viewBtn.textContent = "Ver";
      viewBtn.onclick = () => { selectedAccountId = acc.id; showSection('transactions'); loadTransactions(); };
      const chartBtn = document.createElement("button");
      chartBtn.textContent = "Gráfico";
      chartBtn.onclick = () => { selectedAccountId = acc.id; showSection('charts'); loadChart(); };
      li.append(editBtn, delBtn, viewBtn, chartBtn);
      accountList.appendChild(li);

      const option = document.createElement("option");
      option.value = acc.id;
      option.textContent = acc.name;
      accountSelect.appendChild(option);
    });
    transactionsMenuBtn.disabled = !request.result.length;
  };
}

addAccountBtn.addEventListener("click", () => {
  const name = prompt("Nombre de la cuenta:");
  if (!name) return;
  const description = prompt("Descripción:");
  const tx = db.transaction("accounts", "readwrite").objectStore("accounts");
  tx.add({ name, description, balance: 0 });
  tx.oncomplete = loadAccounts;
});

function editAccount(id) {
  const tx = db.transaction("accounts", "readwrite").objectStore("accounts");
  const req = tx.get(id);
  req.onsuccess = () => {
    const acc = req.result;
    const newName = prompt("Nombre:", acc.name);
    const newDesc = prompt("Descripción:", acc.description);
    acc.name = newName || acc.name;
    acc.description = newDesc || acc.description;
    tx.put(acc).onsuccess = loadAccounts;
  };
}

function deleteAccount(id) {
  if (!confirm("Eliminar esta cuenta?")) return;
  const tx = db.transaction(["accounts","transactions"], "readwrite");
  tx.objectStore("accounts").delete(id);
  const transStore = tx.objectStore("transactions");
  transStore.index("accountId").getAll(id).onsuccess = function(e){
    e.target.result.forEach(t => transStore.delete(t.id));
  };
  tx.oncomplete = loadAccounts;
}

// ------------------- TRANSACCIONES -------------------
function loadTransactionTypes() {
  const tx = db.transaction("transactionTypes", "readonly").objectStore("transactionTypes");
  tx.getAll().onsuccess = (e) => {
    typeSelect.innerHTML = "";
    e.target.result.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.type;
      opt.textContent = t.type;
      typeSelect.appendChild(opt);
    });
  };
}

function loadTransactions() {
  if (!selectedAccountId) return;
  const tx = db.transaction("transactions", "readonly").objectStore("transactions").index("accountId").getAll(selectedAccountId);
  tx.onsuccess = (e) => {
    transactionList.innerHTML = "";
    let balance = 0;
    e.target.result.forEach(t => {
      const li = document.createElement("li");
      li.textContent = `${t.date.split("T")[0]} - ${t.type} - ${t.amount} - ${t.description || ""}`;
      const editBtn = document.createElement("button");
      editBtn.textContent = "Editar";
      editBtn.onclick = () => editTransaction(t.id);
      const delBtn = document.createElement("button");
      delBtn.textContent = "Borrar";
      delBtn.onclick = () => deleteTransaction(t.id);
      li.append(editBtn, delBtn);
      transactionList.appendChild(li);

      balance += (t.type.startsWith("entrada") ? t.amount : -t.amount);
    });
    balanceSpan.textContent = balance;
    updateAccountBalance(balance);
  };
}

addTransactionBtn.addEventListener("click", () => {
  const amount = parseFloat(amountInput.value);
  const type = typeSelect.value;
  const desc = descInput.value;
  if (!selectedAccountId || !amount) return;

  const tx = db.transaction("transactions", "readwrite").objectStore("transactions");
  tx.add({ accountId: selectedAccountId, type, amount, date: new Date().toISOString(), description: desc }).onsuccess = () => {
    amountInput.value = descInput.value = "";
    loadTransactions();
  };
});

function editTransaction(id) {
  const tx = db.transaction("transactions", "readwrite").objectStore("transactions");
  tx.get(id).onsuccess = (e) => {
    const t = e.target.result;
    const newAmount = parseFloat(prompt("Monto:", t.amount)) || t.amount;
    const newType = prompt("Tipo:", t.type) || t.type;
    const newDesc = prompt("Descripción:", t.description) || t.description;
    t.amount = newAmount; t.type = newType; t.description = newDesc;
    tx.put(t).onsuccess = loadTransactions;
  };
}

function deleteTransaction(id) {
  if (!confirm("Eliminar esta transacción?")) return;
  const tx = db.transaction("transactions", "readwrite").objectStore("transactions");
  tx.delete(id).onsuccess = loadTransactions;
}

function updateAccountBalance(balance) {
  const tx = db.transaction("accounts", "readwrite").objectStore("accounts");
  tx.get(selectedAccountId).onsuccess = (e) => {
    const acc = e.target.result;
    acc.balance = balance;
    tx.put(acc).onsuccess = loadAccounts;
  };
}

// ------------------- EXPORT / IMPORT -------------------
exportBtn.addEventListener("click", () => {
  const accTx = db.transaction("accounts", "readonly").objectStore("accounts").getAll();
  const transTx = db.transaction("transactions", "readonly").objectStore("transactions").getAll();

  accTx.onsuccess = () => {
    transTx.onsuccess = () => {
      const dataStr = JSON.stringify({ accounts: accTx.result, transactions: transTx.result });
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "finanzas.json";
      a.click();
    };
  };
});

importBtn.addEventListener("click", () => {
  if (!importFile.files[0]) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = JSON.parse(e.target.result);
    if (!data.accounts || !data.transactions) return;
    const accTx = db.transaction("accounts", "readwrite").objectStore("accounts");
    data.accounts.forEach(a => accTx.put(a));
    accTx.oncomplete = loadAccounts;

    const transTx = db.transaction("transactions", "readwrite").objectStore("transactions");
    data.transactions.forEach(t => transTx.put(t));
    transTx.oncomplete = () => { if(selectedAccountId) loadTransactions(); };
  };
  reader.readAsText(importFile.files[0]);
});
