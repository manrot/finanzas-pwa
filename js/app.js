let db;
let selectedAccountId = null;
let editingAccountId = null; 
// 🚩 NUEVAS VARIABLES DE ESTADO PARA EL USUARIO
let currentUserId = null;
let editingUserId = null; 
let myChart = null; 
let videoStream = null;
let cameraActive = false;

// --- Inicializar IndexedDB (Versión 2 para la nueva store e índices) ---
// 🚩 IMPORTANTE: Si ya tenías una versión 1, necesitas aumentar este número.
const request = indexedDB.open("FinanzasDB", 2); 

request.onupgradeneeded = (e) => {
    db = e.target.result;

    // 🚩 NUEVA STORE: USUARIOS
    if (!db.objectStoreNames.contains("users"))
        db.createObjectStore("users", { keyPath: "id", autoIncrement: true });
    
    // 🚩 ACTUALIZAR STORES EXISTENTES (CUENTAS y TRANSACCIONES)
    
    // Cuentas
    let accountsStore;
    if (!db.objectStoreNames.contains("accounts")) {
        accountsStore = db.createObjectStore("accounts", { keyPath: "id", autoIncrement: true });
    } else {
        accountsStore = e.target.transaction.objectStore("accounts");
    }
    // Asegurar el índice userId en accounts
    if (!accountsStore.indexNames.contains("userId")) {
        accountsStore.createIndex("userId", "userId", { unique: false });
    }

    // Transacciones
    let transactionsStore;
    if (!db.objectStoreNames.contains("transactions")) {
        transactionsStore = db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
        transactionsStore.createIndex("accountId", "accountId", { unique: false });
    } else {
        transactionsStore = e.target.transaction.objectStore("transactions");
    }
    // Asegurar el índice userId en transactions
    if (!transactionsStore.indexNames.contains("userId")) {
        transactionsStore.createIndex("userId", "userId", { unique: false });
    }

    // Tipos de Transacción (GENERAL, no asociado a usuario)
    if (!db.objectStoreNames.contains("transactionTypes")) {
        const store = db.createObjectStore("transactionTypes", { keyPath: "type" });
        ["entrada", "salida", "entrada prestamo", "salida prestamo"].forEach(t =>
            store.add({ type: t, sign: t.startsWith("entrada") ? "+" : "-" })
        );
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    
    // 🚩 INICIAR GESTIÓN DE USUARIO
    initializeUserManagement(); 
    
    loadTransactionTypes();
};

request.onerror = (e) => console.log("Error DB:", e.target.error);

// --- DOM EXISTENTE ---
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

// --- DOM NUEVO PARA USUARIO ---
const userNameSpan = document.querySelector(".user-name");
const userPhoneSpan = document.querySelector(".user-phone"); 
const profileImg = document.querySelector(".profile-img");

// Modal Usuario (Asegúrate de que este modal está en tu index.html o se inyecta con la lógica anterior)
const modalUser = document.getElementById('modalUser') || document.createElement('div');
if (!document.getElementById('modalUser')) {
    modalUser.id = 'modalUser';
    modalUser.className = 'modal';
    modalUser.innerHTML = `
        <div class="modal-content">
            <h3>Crear/Editar Usuario</h3>
            
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <img id="userModalImgPreview" src="https://via.placeholder.com/60" alt="Previsualización" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover;">
                
                <input type="file" id="userPhotoFile" accept="image/*" style="display: none;">
                
                <button id="openCameraBtn" style="background-color: #f39c12;">📷 Tomar Foto / Elegir Archivo</button>
                <button id="capturePhotoBtn" style="display:none; background-color: #2ecc71;">Capturar Foto</button>
                
                <video id="userVideoFeed" style="width: 100%; max-height: 200px; background: #000; display: none;" autoplay></video>
                <canvas id="userPhotoCanvas" style="display: none;"></canvas>
                
            </div>
            
            <input type="text" id="userNameInputUser" placeholder="Nombre(s)" required>
            <input type="text" id="userLastNameInput" placeholder="Apellido(s)" required>
            
            <div style="display:flex; gap:10px;">
                <button id="saveUserBtn">Guardar</button>
                <button class="modal-cancel" onclick="closeModal('modalUser'); stopCamera()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalUser);
}

const userModalImgPreview = document.getElementById('userModalImgPreview');
const userPhotoFile = document.getElementById('userPhotoFile');
const openCameraBtn = document.getElementById('openCameraBtn');
const capturePhotoBtn = document.getElementById('capturePhotoBtn');
const userVideoFeed = document.getElementById('userVideoFeed');
const userPhotoCanvas = document.getElementById('userPhotoCanvas');
const userNameInputUser = document.getElementById('userNameInputUser'); // Cambio de ID para no confundir con accountNameInput
const userLastNameInput = document.getElementById('userLastNameInput');
const saveUserBtn = document.getElementById('saveUserBtn');

saveUserBtn.onclick = saveUserOrEdit;
openCameraBtn.onclick = toggleCameraOrFile;
capturePhotoBtn.onclick = capturePhoto;
userPhotoFile.onchange = handleFilePhoto;

// ----------------------------------------------------------------------
// 🚩 LÓGICA DE USUARIO Y MULTI-TENANT 🚩
// ----------------------------------------------------------------------

function initializeUserManagement() {
    db.transaction("users", "readonly").objectStore("users").getAll().onsuccess = (e) => {
        const users = e.target.result;

        if (users.length === 0) {
            // No hay usuarios, forzar la creación
            openEditUserModal(null); 
        } else {
            // Hay usuarios, cargar el primero por defecto
            currentUserId = users[0].id;
            updateSidebarProfile(users[0]);
            loadAccounts();
        }
    };
}

function updateSidebarProfile(user) {
    userNameSpan.textContent = `${user.name} ${user.lastName}`;
    profileImg.src = user.photoData || 'https://via.placeholder.com/60';
    
    // Limpiar el contenedor de acciones
    userPhoneSpan.innerHTML = '';
    
    const actionContainer = document.createElement('div');
    actionContainer.style.display = 'flex';
    actionContainer.style.gap = '10px';
    actionContainer.style.marginTop = '5px';

    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️ Editar';
    editBtn.onclick = () => openEditUserModal(user.id);
    editBtn.className = 'user-action-btn-primary';

    const addBtn = document.createElement('button');
    addBtn.textContent = '➕ Nuevo';
    addBtn.onclick = () => openEditUserModal(null);
    addBtn.className = 'user-action-btn-secondary';
    
    actionContainer.append(editBtn, addBtn);
    userPhoneSpan.appendChild(actionContainer);
}

function openEditUserModal(userId = null) {
    editingUserId = userId;
    userNameInputUser.value = '';
    userLastNameInput.value = '';
    userModalImgPreview.src = 'https://via.placeholder.com/60';
    stopCamera();

    if (userId !== null) {
        db.transaction("users", "readonly").objectStore("users").get(userId).onsuccess = (e) => {
            const user = e.target.result;
            userNameInputUser.value = user.name;
            userLastNameInput.value = user.lastName;
            userModalImgPreview.src = user.photoData || 'https://via.placeholder.com/60';
        };
    }
    openModal('modalUser');
}

async function toggleCameraOrFile() {
    if (cameraActive) {
        stopCamera();
    } else {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            userVideoFeed.srcObject = videoStream;
            userVideoFeed.style.display = 'block';
            capturePhotoBtn.style.display = 'block';
            openCameraBtn.textContent = '❌ Cerrar Cámara / Elegir Archivo';
            cameraActive = true;
        } catch (err) {
            console.error("No se pudo iniciar la cámara. Abriendo selector de archivos.", err);
            userPhotoFile.click();
        }
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        userVideoFeed.srcObject = null;
        userVideoFeed.style.display = 'none';
        capturePhotoBtn.style.display = 'none';
        openCameraBtn.textContent = '📷 Tomar Foto / Elegir Archivo';
        cameraActive = false;
    }
}

function capturePhoto() {
    const context = userPhotoCanvas.getContext('2d');
    const width = userVideoFeed.videoWidth;
    const height = userVideoFeed.videoHeight;
    userPhotoCanvas.width = width;
    userPhotoCanvas.height = height;

    context.drawImage(userVideoFeed, 0, 0, width, height);
    
    const photoData = userPhotoCanvas.toDataURL('image/jpeg'); 
    userModalImgPreview.src = photoData;
    
    stopCamera();
}

function handleFilePhoto(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            userModalImgPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function saveUserOrEdit() {
    const name = userNameInputUser.value;
    const lastName = userLastNameInput.value;
    const photoData = userModalImgPreview.src;
    if (!name || !lastName) return;

    const tx = db.transaction("users", "readwrite").objectStore("users");

    if (editingUserId !== null) {
        // Edición
        tx.get(editingUserId).onsuccess = (e) => {
            const user = e.target.result;
            user.name = name;
            user.lastName = lastName;
            user.photoData = photoData;
            tx.put(user).onsuccess = () => {
                closeModal("modalUser");
                if (currentUserId === editingUserId) {
                    updateSidebarProfile(user);
                }
                loadUserListSettings(); 
            };
        };
    } else {
        // Nuevo usuario
        const newUser = { name, lastName, photoData, selectedAccountId: null };
        tx.add(newUser).onsuccess = (e) => {
            const newId = e.target.result;
            closeModal("modalUser");
            if (currentUserId === null) {
                currentUserId = newId;
                updateSidebarProfile(newUser);
                loadAccounts();
            }
            loadUserListSettings(); 
        };
    }
}

function switchUser(newUserId) {
    db.transaction("users", "readonly").objectStore("users").get(newUserId).onsuccess = (e) => {
        const user = e.target.result;
        currentUserId = newUserId;
        updateSidebarProfile(user);
        loadAccounts(); 
        loadUserListSettings(); 
        showSection('accounts'); 
    };
}

function deleteUser(id) {
    db.transaction("users", "readonly").objectStore("users").getAll().onsuccess = (e) => {
        const users = e.target.result;
        if (users.length <= 1) {
            alert("No puedes eliminar al último usuario.");
            return;
        }

        if (!confirm(`¿Estás seguro de eliminar a este usuario y todos sus datos (cuentas/transacciones)?`)) return;

        const tx = db.transaction(["users", "accounts", "transactions"], "readwrite");
        
        // 1. Eliminar usuario
        tx.objectStore("users").delete(id);

        // 2. Eliminar cuentas asociadas
        const accStore = tx.objectStore("accounts");
        accStore.index("userId").getAll(id).onsuccess = (e) => {
            const accounts = e.target.result;
            accounts.forEach(acc => accStore.delete(acc.id));
        };
        
        // 3. Eliminar transacciones asociadas
        const transStore = tx.objectStore("transactions");
        transStore.index("userId").getAll(id).onsuccess = (e) => {
            e.target.result.forEach(t => transStore.delete(t.id));
        };

        tx.oncomplete = () => {
            alert("Usuario eliminado con éxito.");
            
            if (id === currentUserId) {
                db.transaction("users", "readonly").objectStore("users").getAll().onsuccess = (e) => {
                    const remainingUsers = e.target.result;
                    if (remainingUsers.length > 0) {
                        switchUser(remainingUsers[0].id);
                    } else {
                        currentUserId = null;
                        initializeUserManagement();
                    }
                };
            } else {
                loadUserListSettings();
            }
        };
    };
}


// ----------------------------------------------------------------------
// 🚩 LÓGICA DE SECCIONES Y MODALES EXISTENTE (Modificada para Usuario) 🚩
// ----------------------------------------------------------------------

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
    } else if (id === "settings") {
        loadUserListSettings();
    }
    // El 'charts' se mantiene, asumiendo que ya tienes loadChart()
}

document.addEventListener('DOMContentLoaded', () => {
    // Asegurar los listeners del menú si no estaban asignados en el HTML
    menuToggle.addEventListener("click", openSidebar);
    menuOverlay.addEventListener("click", closeSidebar); 
    
    showSection('accounts');
});


// 🚩 LÓGICA DE MENÚ LATERAL (SIDEBAR) 🚩
const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const menuOverlay = document.getElementById("menuOverlay");
const contentWrapper = document.getElementById("contentWrapper");

function openSidebar() {
    if (window.innerWidth < 992) {
        sidebarMenu.classList.add("open");
        menuOverlay.classList.add("open");
    }
}

function closeSidebar() {
    sidebarMenu.classList.remove("open");
    menuOverlay.classList.remove("open");
}

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

// --- Cuentas (Modificada para filtrar por userId) ---

addAccountBtn.addEventListener("click", () => {
    if (!currentUserId) return alert("Por favor, crea un usuario primero.");
    accountNameInput.value = "";
    accountDescInput.value = "";
    editingAccountId = null; 
    openModal("modalAccount");
});

function saveAccountOrEdit() {
    const name = accountNameInput.value;
    const desc = accountDescInput.value;
    if (!name || !currentUserId) return;

    const tx = db.transaction("accounts", "readwrite").objectStore("accounts");

    if (editingAccountId !== null) {
        tx.get(editingAccountId).onsuccess = (e) => {
            const acc = e.target.result;
            acc.name = name;
            acc.description = desc;
            tx.put(acc).onsuccess = () => {
                closeModal("modalAccount");
                loadAccounts();
                editingAccountId = null; 
            };
        };
    } else {
        // 🚩 AÑADIR EL ID DEL USUARIO
        tx.add({ name, description: desc, balance: 0, userId: currentUserId }).onsuccess = () => {
            closeModal("modalAccount");
            loadAccounts();
        };
    }
}
saveAccountBtn.onclick = saveAccountOrEdit; 

function loadAccounts() {
    if (!currentUserId) {
        accountList.innerHTML = "<li>Crea un usuario para empezar a agregar cuentas.</li>";
        return;
    }
    
    // 🚩 FILTRAR POR USER ID
    const tx = db.transaction("accounts", "readonly").objectStore("accounts").index("userId");
    tx.getAll(currentUserId).onsuccess = (e) => {
        accountList.innerHTML = "";
        const accounts = e.target.result;
        
        accounts.forEach(acc => {
            const li = document.createElement("li");

            const mainInfoDiv = document.createElement("div");
            mainInfoDiv.className = "account-main-info";
            const nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.textContent = acc.name;
            const descSpan = document.createElement("span");
            descSpan.className = "description";
            descSpan.textContent = acc.description || "Sin descripción";
            mainInfoDiv.append(nameSpan, descSpan);

            const balanceActionsDiv = document.createElement("div");
            balanceActionsDiv.className = "account-balance-actions";
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
                // Asumiendo que chartFrom/chartTo existen en tu HTML para filtros
                const chartFrom = document.getElementById("chartFrom");
                const chartTo = document.getElementById("chartTo");
                if(chartFrom) chartFrom.value = "";
                if(chartTo) chartTo.value = "";
                showSection('charts');
                loadChart();
            };
            actionsDiv.append(editBtn, delBtn, viewBtn, chartBtn);

            const saldoLabel = document.createElement("span");
            saldoLabel.className = "saldo-label";
            saldoLabel.textContent = "Saldo disponible";

            const saldoAmount = document.createElement("span");
            saldoAmount.className = "saldo-amount";
            saldoAmount.textContent = "$ " + (acc.balance || 0).toFixed(2);
            
            const balance = acc.balance || 0;
            if (balance >= 0) {
                saldoAmount.classList.add("positive");
            } else {
                saldoAmount.classList.add("negative");
            }
            
            balanceActionsDiv.append(actionsDiv, saldoLabel, saldoAmount);
            li.append(mainInfoDiv, balanceActionsDiv);
            accountList.appendChild(li);
        });

        transactionsMenuBtn.disabled = !accounts.length;
        populateTransactionAccounts(accounts);
        populateChartAccounts(accounts);
    };
}

function editAccount(id) {
    const tx = db.transaction("accounts", "readonly").objectStore("accounts");
    tx.get(id).onsuccess = (e) => {
        const acc = e.target.result;
        accountNameInput.value = acc.name;
        accountDescInput.value = acc.description;
        editingAccountId = acc.id; 
        openModal("modalAccount");
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

// --- Transacciones (Modificada para asignar userId) ---
addTransactionBtn.addEventListener("click", () => {
    if (!currentUserId) return alert("Crea un usuario para registrar transacciones.");
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
    if (!selectedAccountId || !amount || !typeName || !currentUserId) return; // Validación de usuario

    db.transaction("transactionTypes", "readonly").objectStore("transactionTypes").get(typeName).onsuccess = (e) => {
        const signo = e.target.result.sign;
        const tx = db.transaction("transactions", "readwrite").objectStore("transactions");
        tx.add({
            accountId: selectedAccountId,
            userId: currentUserId, // 🚩 AÑADIR EL ID DEL USUARIO
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
    if (!accountId || !currentUserId) return; // Validación de usuario

    const fromDate = fromDateInput.value;
    const toDate = toDateInput.value;

    const tx = db.transaction("transactions", "readonly").objectStore("transactions").index("accountId");
    tx.getAll(Number(accountId)).onsuccess = (e) => {
        // 🚩 Filtrar por userId, aunque si las cuentas son únicas por usuario, esto es redundante, es buena práctica:
        let data = e.target.result.filter(t => t.userId === currentUserId);
        
        if (fromDate) data = data.filter(t => t.date.split("T")[0] >= fromDate);
        if (toDate) data = data.filter(t => t.date.split("T")[0] <= toDate);

        transactionList.innerHTML = "";
        let balance = 0;

        data.sort((a,b)=> new Date(b.date) - new Date(a.date));

        data.forEach(t => {
            balance += t.sign === "+" ? t.amount : -t.amount;
            
            // ... (Lógica de construcción de LI) ...
            const li = document.createElement("li");
            li.className = "transaction-item";

            const infoDiv = document.createElement("div");
            infoDiv.className = "transaction-info";
            const nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.textContent = t.description || t.type;
            const dateSpan = document.createElement("span");
            dateSpan.className = "description";
            dateSpan.textContent = new Date(t.date).toLocaleDateString();
            infoDiv.append(nameSpan, dateSpan);
            
            const amountSpan = document.createElement("span");
            amountSpan.className = "balance " + (t.sign === "+" ? "income" : "expense");
            amountSpan.textContent = (t.sign === "+" ? "+ " : "- ") + t.amount;
            
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
        accountFilterSelect.value = accountId; // Mantener el filtro seleccionado
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

// --- Tipos de Movimiento (Se mantienen GENERALES) ---
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
            // ... (Lógica de construcción de LI) ...
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

// --- Filtrar por cuenta (Ahora solo carga las del usuario actual) ---
function populateTransactionAccounts(accounts) {
    // Si no se pasa el array de cuentas, lo carga. Esto es para ser más eficiente.
    const currentAccounts = accounts || [];
    
    accountFilterSelect.innerHTML = "<option value=''>-- Selecciona Cuenta --</option>";
    currentAccounts.forEach(acc => {
        const opt = document.createElement("option");
        opt.value = acc.id;
        opt.textContent = acc.name;
        accountFilterSelect.appendChild(opt);
    });
    // Si hay cuentas, selecciona la primera por defecto para que loadTransactions funcione
    if (currentAccounts.length > 0) {
        selectedAccountId = currentAccounts[0].id;
        accountFilterSelect.value = selectedAccountId;
    }
}

// --- Gráficos (Ahora solo carga las del usuario actual) ---
function populateChartAccounts(accounts) {
    const currentAccounts = accounts || [];
    
    chartAccountSelect.innerHTML = "<option value=''>-- Seleccione Cuenta --</option>";
    currentAccounts.forEach(acc => {
        const opt = document.createElement("option");
        opt.value = acc.id;
        opt.textContent = acc.name;
        chartAccountSelect.appendChild(opt);
    });
}

function loadChart() {
    // Se mantiene la función que ya tienes implementada. Solo requiere el ID de la cuenta, que ya está filtrado por usuario.
}


// --- Lógica de la Configuración (Settings) ---

function loadUserListSettings() {
    let container = document.getElementById('userManagementContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'userManagementContainer';
        container.innerHTML = '<h3>Gestión de Usuarios</h3><ul id="userListSettings" class="type-list"></ul><button id="addNewUserSettingBtn" class="btn-add">➕ Añadir Nuevo Usuario</button>';
        document.getElementById('settingsSection').appendChild(container);
        document.getElementById('addNewUserSettingBtn').onclick = () => openEditUserModal(null);
    }
    
    const listElement = document.getElementById('userListSettings');
    listElement.innerHTML = '';
    
    db.transaction("users", "readonly").objectStore("users").getAll().onsuccess = (e) => {
        const users = e.target.result;
        
        users.forEach(user => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            
            const isCurrent = user.id === currentUserId;
            
            li.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${user.photoData || 'https://via.placeholder.com/60'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <span>${user.name} ${user.lastName} ${isCurrent ? ' <span style="font-weight: bold; color: var(--color-primary);">(ACTUAL)</span>' : ''}</span>
                </div>
                <div style="display:flex; gap: 5px;">
                    <button onclick="openEditUserModal(${user.id})">✏️</button>
                    ${users.length > 1 ? `<button onclick="deleteUser(${user.id})" style="background-color: var(--color-danger);">🗑️</button>` : ''}
                    ${!isCurrent ? `<button onclick="switchUser(${user.id})" style="background-color: var(--color-secondary);">Cambiar</button>` : ''}
                </div>
            `;
            listElement.appendChild(li);
        });
    };
}