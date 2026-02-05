let currentUser = null;

async function api(path, method = "GET", body = null) {
    const headers = {
        "Content-Type": "application/json",
    };
    if (currentUser) {
        headers["X-User-ID"] = currentUser.id;
    }
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "API Error");
    }
    return response.json();
}

async function login(username) {
    try {
        currentUser = await api("/api/login", "POST", { username });
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("app-screen").classList.remove("hidden");
        document.getElementById("current-username").innerText = currentUser.username;
        document.getElementById("current-role").innerText = currentUser.role;

        if (currentUser.role === "employee") {
            document.getElementById("doc-submission").classList.remove("hidden");
        } else {
            document.getElementById("doc-submission").classList.add("hidden");
        }

        loadDocuments();
    } catch (e) {
        alert(e.message);
    }
}

function logout() {
    currentUser = null;
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

async function loadDocuments() {
    try {
        const docs = await api("/api/documents");
        const listDiv = document.getElementById("doc-list");
        listDiv.innerHTML = "";
        docs.forEach(doc => {
            const card = document.createElement("div");
            card.className = "doc-card";
            card.innerHTML = `
                <h3>${doc.title}</h3>
                <p>${doc.description}</p>
                <div class="status-badge status-${doc.status}">${doc.status}</div>
            `;
            card.onclick = () => showDocument(doc.id);
            listDiv.appendChild(card);
        });
    } catch (e) {
        alert(e.message);
    }
}

async function showDocument(id) {
    try {
        const doc = await api(`/api/documents/${id}`);
        const audit = await api(`/api/documents/${id}/audit`);

        document.getElementById("doc-list-section").classList.add("hidden");
        document.getElementById("doc-submission").classList.add("hidden");
        document.getElementById("doc-detail-section").classList.remove("hidden");

        const detailDiv = document.getElementById("doc-detail");
        detailDiv.innerHTML = `
            <h1>${doc.title}</h1>
            <p><strong>Type:</strong> ${doc.document_type}</p>
            <p><strong>Description:</strong> ${doc.description}</p>
            <div class="status-badge status-${doc.status}">${doc.status}</div>
            <hr>
            <pre style="white-space: pre-wrap; background: #f1f5f9; padding: 1rem; border-radius: 4px;">${doc.content}</pre>
        `;

        const actionsDiv = document.getElementById("doc-actions");
        if (currentUser.role === "manager" && doc.status === "PENDING_REVIEW" && doc.owner_id !== currentUser.id) {
            actionsDiv.classList.remove("hidden");
            document.getElementById("approve-btn").onclick = () => takeAction(id, "APPROVE", doc.version);
            document.getElementById("reject-btn").onclick = () => takeAction(id, "REJECT", doc.version);
        } else {
            actionsDiv.classList.add("hidden");
        }

        const auditList = document.getElementById("audit-logs");
        auditList.innerHTML = audit.length ? "" : "<li>No history yet</li>";
        audit.forEach(log => {
            const li = document.createElement("li");
            li.innerText = `${new Date(log.timestamp).toLocaleString()}: ${log.previous_status} → ${log.new_status} (by User ID ${log.acting_user_id})`;
            auditList.appendChild(li);
        });

    } catch (e) {
        alert(e.message);
    }
}

async function takeAction(id, action, version) {
    try {
        await api(`/api/documents/${id}/action`, "POST", { action, version });
        alert(`Success: Document ${action}D`);
        showDocument(id);
    } catch (e) {
        alert(e.message);
    }
}

function backToList() {
    document.getElementById("doc-detail-section").classList.add("hidden");
    document.getElementById("doc-list-section").classList.remove("hidden");
    if (currentUser.role === "employee") {
        document.getElementById("doc-submission").classList.remove("hidden");
    }
    loadDocuments();
}

document.getElementById("submit-form").onsubmit = async (e) => {
    e.preventDefault();
    const doc = {
        title: document.getElementById("doc-title").value,
        description: document.getElementById("doc-description").value,
        document_type: document.getElementById("doc-type").value,
        content: document.getElementById("doc-content").value,
    };
    try {
        await api("/api/documents", "POST", doc);
        alert("Document submitted!");
        e.target.reset();
        loadDocuments();
    } catch (e) {
        alert(e.message);
    }
};
