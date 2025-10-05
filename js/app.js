let db;
let selectedAccountId = null;

// --- Inicializar IndexedDB ---
const request = indexedDB.open("FinanzasDB", 1);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    
    if (!db.objectStoreNames.contains("accounts"))
        db.createObjectStore("accounts", { keyPath: "id", autoIncrement: true });

    if (!db.objectStoreNames.contains("transactions")) {
        const store = db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
        store.createIndex("accountId", "accountId", { unique: false });
    }

    if (!db.objectStoreNames.contains("transactionTypes")) {
        const store = db.createObjectStore("transactionTypes", { keyPath: "type" });
        ["entrada", "salida", "entrada prestamo", "salida prestamo"].forEach(t =>
            store.add({ type: t, sign: t.startsWith("entrada") ? "+" : "-" })
        );
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadAccounts();
    loadTransactionTypes();
    populateTransactionAccounts();
    populateChartAccounts();
};

request.onerror = (e) => console.log("Error DB:", e.target.error);

// --- DOM ---
const accountList = document.getElementById("accountList");
const transactionList = document.getElementById("transactionList");
const typeList = document.getElementById("typeList");
const transactionsMenuBtn = document.getElementById("transactionsMenuBtn");
const balanceSpan = document.getElementById("balance");
const accountNameInput = document.getElementById("accountNameInput");
const accountDescInput = document.getElementById("accountDescInput");
const saveAccountBtn = document.getElementById("saveAccountBtn");
const addAccountBtn = document.getElementById("addAccountBtn");
const transactionAmountInput = document.getElementById("transactionAmountInput");
const transactionDescInput = document.getElementById("transactionDescInput");
const transactionTypeSelect = document.getElementById("transactionTypeSelect");
const saveTransactionBtn = document.getElementById("saveTransactionBtn");
const addTransactionBtn = document.getElementById("addTransactionBtn");
const typeNameInput = document.getElementById("typeNameInput");
const typeSignInput = document.getElementById("typeSignInput");
const saveTypeBtn = document.getElementById("saveTypeBtn");
const addTypeBtn = document.getElementById("addTypeBtn");
const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");
const accountFilterSelect = document.getElementById("accountFilterSelect");
const chartAccountSelect = document.getElementById("chartAccountSelect");

// --- Secciones ---
function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.style.display = "none");
    document.getElementById(id + "Section").style.display = "block";

    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick')?.includes(`showSection('${id}')`)) {
            link.classList.add('active');
        }
    });

    if (id === "accounts") {
        loadAccounts();
    } else if (id === "transactions") {
        loadTransactions();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    showSection('accounts');
});


// 🚩 LÓGICA DE MENÚ LATERAL (SIDEBAR) 🚩
const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const menuOverlay = document.getElementById("menuOverlay");

function openSidebar() {
    sidebarMenu.classList.add("open");
    menuOverlay.classList.add("open");
}

function closeSidebar() {
    sidebarMenu.classList.remove("open");
    menuOverlay.classList.remove("open");
}

menuToggle.addEventListener("click", openSidebar);
menuOverlay.addEventListener("click", closeSidebar); 


// 🚩 LÓGICA DE MODALES (Añade transición) 🚩
function openModal(id) { 
    const modal = document.getElementById(id);
    modal.style.display = "flex"; 
    setTimeout(() => { modal.classList.add('active'); }, 10);
}
function closeModal(id) { 
    const modal = document.getElementById(id);
    modal.classList.remove('active'); 
    setTimeout(() => { modal.style.display = "none"; }, 300);
}

// --- Cuentas ---
addAccountBtn.addEventListener("click", () => {
    accountNameInput.value = "";
    accountDescInput.value = "";
    saveAccountBtn.onclick = saveNewAccount;
    openModal("modalAccount");
});

function saveNewAccount() {
    const name = accountNameInput.value;
    const desc = accountDescInput.value;
    if (!name) return;

    const tx = db.transaction("accounts", "readwrite").objectStore("accounts");
    tx.add({ name, description: desc, balance: 0 }).onsuccess = () => {
        closeModal("modalAccount");
        loadAccounts();
    };
}
saveAccountBtn.onclick = saveNewAccount; 

function loadAccounts() {
    const tx = db.transaction("accounts", "readonly").objectStore("accounts");
    tx.getAll().onsuccess = (e) => {
        accountList.innerHTML = "";
        e.target.result.forEach(acc => {
            const li = document.createElement("li");

            // --- Contenedor Principal de Información (izquierda) ---
            const mainInfoDiv = document.createElement("div");
            mainInfoDiv.className = "account-main-info";

            const nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.textContent = acc.name;

            const descSpan = document.createElement("span");
            descSpan.className = "description";
            descSpan.textContent = acc.description || "Sin descripción";

            mainInfoDiv.append(nameSpan, descSpan);

            // --- Contenedor de Saldo y Acciones (derecha) ---
            const balanceActionsDiv = document.createElement("div");
            balanceActionsDiv.className = "account-balance-actions";

            // Botones de acción (arriba del saldo)
            const actionsDiv = document.createElement("div");
            actionsDiv.className = "account-actions";
            
            const editBtn = document.createElement("button");
            editBtn.textContent = "✏️";
            editBtn.title = "Editar";
            editBtn.onclick = () => editAccount(acc.id);

            const delBtn = document.createElement("button");
            delBtn.textContent = "🗑️";
            delBtn.title = "Borrar";
            delBtn.onclick = () => deleteAccount(acc.id);

            const viewBtn = document.createElement("button");
            viewBtn.textContent = "💰";
            viewBtn.title = "Ver Movimientos";
            viewBtn.onclick = () => {
                selectedAccountId = acc.id;
                fromDateInput.value = "";
                toDateInput.value = "";
                showSection('transactions');
                loadTransactions();
            };

            const chartBtn = document.createElement("button");
            chartBtn.textContent = "📊";
            chartBtn.title = "Gráfico";
            chartBtn.onclick = () => {
                selectedAccountId = acc.id;
                chartAccountSelect.value = acc.id;
                showSection('charts');
                loadChart();
            };
            actionsDiv.append(editBtn, delBtn, viewBtn, chartBtn);


            // Saldo
            const saldoLabel = document.createElement("span");
            saldoLabel.className = "saldo-label";
            saldoLabel.textContent = "Saldo disponible";

            const saldoAmount = document.createElement("span");
            saldoAmount.className = "saldo-amount";
            saldoAmount.textContent = "$ " + (acc.balance || 0).toFixed(2);
            
            // Adjuntar acciones y saldo al contenedor derecho
            balanceActionsDiv.append(actionsDiv, saldoLabel, saldoAmount);


            // Adjuntar ambos contenedores al <li>
            li.append(mainInfoDiv, balanceActionsDiv);
            accountList.appendChild(li);
        });

        transactionsMenuBtn.disabled = !e.target.result.length;
        populateTransactionAccounts();
        populateChartAccounts();
    };
}

function editAccount(id) {
    const tx = db.transaction("accounts", "readwrite").objectStore("accounts");
    tx.get(id).onsuccess = (e) => {
        const acc = e.target.result;
        accountNameInput.value = acc.name;
        accountDescInput.value = acc.description;
        openModal("modalAccount");

        saveAccountBtn.onclick = () => {
            acc.name = accountNameInput.value || acc.name;
            acc.description = accountDescInput.value || acc.description;
            tx.put(acc).onsuccess = () => {
                closeModal("modalAccount");
                loadAccounts();
                saveAccountBtn.onclick = saveNewAccount;
            };
        };
    };
}

function deleteAccount(id) {
    if (!confirm("Eliminar cuenta?")) return;
    const tx = db.transaction(["accounts", "transactions"], "readwrite");
    tx.objectStore("accounts").delete(id);
    const transStore = tx.objectStore("transactions");
    transStore.index("accountId").getAll(id).onsuccess = function (e) {
        e.target.result.forEach(t => transStore.delete(t.id));
    };
    tx.oncomplete = loadAccounts;
}

// --- Transacciones ---
addTransactionBtn.addEventListener("click", () => {
    transactionAmountInput.value = "";
    transactionDescInput.value = "";
    loadTransactionTypes();
    saveTransactionBtn.onclick = saveNewTransaction;
    openModal("modalTransaction");
});

function saveNewTransaction() {
    const amount = parseFloat(transactionAmountInput.value);
    const typeName = transactionTypeSelect.value;
    const desc = transactionDescInput.value;
    if (!selectedAccountId || !amount || !typeName) return;

    db.transaction("transactionTypes", "readonly").objectStore("transactionTypes").get(typeName).onsuccess = (e) => {
        const signo = e.target.result.sign;
        const tx = db.transaction("transactions", "readwrite").objectStore("transactions");
        tx.add({
            accountId: selectedAccountId,
            type: typeName,
            amount,
            sign: signo,
            date: new Date().toISOString(),
            description: desc
        }).onsuccess = () => {
            closeModal("modalTransaction");
            loadTransactions();
        };
    };
}
saveTransactionBtn.onclick = saveNewTransaction;

function loadTransactions() {
    const selectedFilterAccount = accountFilterSelect.value;
    const accountId = selectedFilterAccount || selectedAccountId;
    if (!accountId) return;

    const fromDate = fromDateInput.value;
    const toDate = toDateInput.value;

    const tx = db.transaction("transactions", "readonly").objectStore("transactions").index("accountId");
    tx.getAll(Number(accountId)).onsuccess = (e) => {
        let data = e.target.result;
        if (fromDate) data = data.filter(t => t.date.split("T")[0] >= fromDate);
        if (toDate) data = data.filter(t => t.date.split("T")[0] <= toDate);

        transactionList.innerHTML = "";
        let balance = 0;

        data.sort((a,b)=> new Date(b.date) - new Date(a.date));

        data.forEach(t => {
            balance += t.sign === "+" ? t.amount : -t.amount;

            const li = document.createElement("li");
            li.className = "transaction-item";

            // Info izquierda
            const infoDiv = document.createElement("div");
            infoDiv.className = "transaction-info";

            const nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.textContent = t.description || t.type;

            const dateSpan = document.createElement("span");
            dateSpan.className = "description";
            dateSpan.textContent = new Date(t.date).toLocaleDateString();

            infoDiv.append(nameSpan, dateSpan);
            
            // Monto derecha
            const amountSpan = document.createElement("span");
            amountSpan.className = "balance " + (t.sign === "+" ? "income" : "expense");
            amountSpan.textContent = (t.sign === "+" ? "+ " : "- ") + t.amount;
            
            // Acciones a la derecha
            const actionsDiv = document.createElement("div");
            actionsDiv.className = "transaction-actions";
            
            const editBtn = document.createElement("button");
            editBtn.textContent = "✏️";
            editBtn.title = "Editar";
            editBtn.onclick = () => editTransaction(t.id);

            const delBtn = document.createElement("button");
            delBtn.textContent = "🗑️";
            delBtn.title = "Borrar";
            delBtn.onclick = () => deleteTransaction(t.id);
            
            actionsDiv.append(editBtn, delBtn);
            
            li.append(infoDiv, amountSpan, actionsDiv); 
            transactionList.appendChild(li);
        });

        balanceSpan.textContent = balance.toFixed(2);
        updateAccountBalance(balance);
    };
}


fromDateInput.addEventListener("change", loadTransactions);
toDateInput.addEventListener("change", loadTransactions);
accountFilterSelect.addEventListener("change", loadTransactions);

function editTransaction(id) {
    const tx = db.transaction("transactions", "readwrite").objectStore("transactions");
    tx.get(id).onsuccess = (e) => {
        const t = e.target.result;
        transactionAmountInput.value = t.amount;
        transactionDescInput.value = t.description;
        loadTransactionTypes();
        transactionTypeSelect.value = t.type;
        openModal("modalTransaction");

        saveTransactionBtn.onclick = () => { 
            t.amount = parseFloat(transactionAmountInput.value) || t.amount;
            t.description = transactionDescInput.value || t.description;
            t.type = transactionTypeSelect.value;

            db.transaction("transactionTypes", "readonly").objectStore("transactionTypes").get(t.type).onsuccess = (e) => {
                t.sign = e.target.result.sign;
                tx.put(t).onsuccess = () => {
                    closeModal("modalTransaction");
                    loadTransactions();
                    saveTransactionBtn.onclick = saveNewTransaction;
                };
            };
        };
    };
}

function deleteTransaction(id) {
    if (!confirm("Eliminar transacción?")) return;
    db.transaction("transactions", "readwrite").objectStore("transactions").delete(id).onsuccess = loadTransactions;
}

function updateAccountBalance(balance) {
    db.transaction("accounts", "readwrite").objectStore("accounts").get(selectedAccountId).onsuccess = (e) => {
        const acc = e.target.result;
        if (acc && !isNaN(balance)) {
             acc.balance = balance;
             db.transaction("accounts", "readwrite").objectStore("accounts").put(acc).onsuccess = loadAccounts;
        } else {
             loadAccounts();
        }
    };
}

// --- Tipos de Movimiento ---
addTypeBtn.addEventListener("click", () => {
    typeNameInput.value = "";
    typeSignInput.value = "+";
    saveTypeBtn.onclick = saveNewType;
    openModal("modalType");
});

function saveNewType() {
    const name = typeNameInput.value;
    const sign = typeSignInput.value;
    if (!name) return;
    db.transaction("transactionTypes", "readwrite").objectStore("transactionTypes").put({ type: name, sign }).onsuccess = () => {
        closeModal("modalType");
        loadTransactionTypes();
    };
}
saveTypeBtn.onclick = saveNewType;

function loadTransactionTypes() {
    const tx = db.transaction("transactionTypes", "readonly").objectStore("transactionTypes");
    tx.getAll().onsuccess = (e) => {
        transactionTypeSelect.innerHTML = "";
        typeList.innerHTML = "";

        e.target.result.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.type;
            opt.textContent = t.type;
            transactionTypeSelect.appendChild(opt);

            const li = document.createElement("li");
            const infoDiv = document.createElement("div");
            infoDiv.className = "type-info";

            const nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.textContent = t.type;

            const descSpan = document.createElement("span");
            descSpan.className = "description";
            descSpan.textContent = t.sign === "+" ? "Positivo" : "Negativo";

            infoDiv.append(nameSpan, descSpan);

            const actionsDiv = document.createElement("div");
            actionsDiv.className = "type-actions";

            const editBtn = document.createElement("button");
            editBtn.textContent = "✏️";
            editBtn.title = "Editar";
            editBtn.onclick = () => {
                typeNameInput.value = t.type;
                typeSignInput.value = t.sign;
                openModal("modalType");

                saveTypeBtn.onclick = () => { 
                    t.type = typeNameInput.value || t.type;
                    t.sign = typeSignInput.value || t.sign;
                    db.transaction("transactionTypes", "readwrite").objectStore("transactionTypes").put(t).onsuccess = () => {
                        closeModal("modalType");
                        loadTransactionTypes();
                        saveTypeBtn.onclick = saveNewType;
                    };
                };
            };

            const delBtn = document.createElement("button");
            delBtn.textContent = "🗑️";
            delBtn.title = "Borrar";
            delBtn.onclick = () => {
                if (!confirm("Eliminar tipo?")) return;
                db.transaction("transactionTypes", "readwrite").objectStore("transactionTypes").delete(t.type).onsuccess = loadTransactionTypes;
            };

            actionsDiv.append(editBtn, delBtn);
            li.append(infoDiv, actionsDiv);
            typeList.appendChild(li);
        });
    };
}

// --- Filtrar por cuenta ---
function populateTransactionAccounts() {
    const tx = db.transaction("accounts", "readonly").objectStore("accounts");
    tx.getAll().onsuccess = (e) => {
        accountFilterSelect.innerHTML = "<option value=''>-- Todas las Cuentas --</option>";
        e.target.result.forEach(acc => {
            const opt = document.createElement("option");
            opt.value = acc.id;
            opt.textContent = acc.name;
            accountFilterSelect.appendChild(opt);
        });
    };
}

// --- Gráficos ---
function populateChartAccounts() {
    const tx = db.transaction("accounts", "readonly").objectStore("accounts");
    tx.getAll().onsuccess = (e) => {
        chartAccountSelect.innerHTML = "<option value=''>-- Seleccione Cuenta --</option>";
        e.target.result.forEach(acc => {
            const opt = document.createElement("option");
            opt.value = acc.id;
            opt.textContent = acc.name;
            chartAccountSelect.appendChild(opt);
        });
    };
}

function loadChart() {
    // Aquí puedes implementar chart.js u otra librería usando chartAccountSelect.value
}