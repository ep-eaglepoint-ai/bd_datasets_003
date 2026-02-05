let currentUser = null;

// Utility to prevent XSS
function escapeHtml(text) {
    if (!text) return text;
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function fetchUsers() {
    try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const users = await res.json();
        const container = document.getElementById('user-list');
        container.innerHTML = users.map(u => `
            <button onclick="login(${u.id}, '${escapeHtml(u.username)}', '${u.role}', ${u.balance})">
                Login as ${escapeHtml(u.username)} (${u.role})
            </button>
        `).join(' ');
    } catch (e) {
        console.error(e);
        alert('Could not load users.');
    }
}

function login(id, username, role, balance) {
    currentUser = { id, username, role, balance };
    document.querySelectorAll('.username-display').forEach(el => el.textContent = username);

    document.getElementById('auth-view').classList.add('hidden');
    if (role === 'employee') {
        document.getElementById('employee-dashboard').classList.remove('hidden');
        document.getElementById('emp-balance').textContent = balance;
        loadMyRequests();
    } else {
        document.getElementById('manager-dashboard').classList.remove('hidden');
        loadAllRequests();
    }
}

function logout() {
    currentUser = null;
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('employee-dashboard').classList.add('hidden');
    document.getElementById('manager-dashboard').classList.add('hidden');
    fetchUsers(); // Refresh in case balances changed
}

// Employee Actions
document.getElementById('leave-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('request-msg');
    msg.textContent = '';

    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    const type = document.getElementById('leave-type').value;
    const reason = document.getElementById('reason').value;

    const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            employee_id: currentUser.id,
            start_date: start,
            end_date: end,
            leave_type: type,
            reason: reason
        })
    });

    const data = await res.json();
    if (res.ok) {
        loadMyRequests();
        e.target.reset(); // Clear form
        // Refresh user info to see if anything weird happened (balance shouldn't change yet)
    } else {
        msg.textContent = data.error;
    }
});

async function loadMyRequests() {
    try {
        const res = await fetch(`/api/requests?user_id=${currentUser.id}`);
        if (!res.ok) throw new Error('Failed to fetch requests');
        const requests = await res.json();

        // Also refresh user details to update balance if approved
        const uRes = await fetch('/api/users');
        if (uRes.ok) {
            const allUsers = await uRes.json();
            const me = allUsers.find(u => u.id === currentUser.id);
            const balanceEl = document.getElementById('emp-balance');
            if (me && balanceEl) {
                balanceEl.textContent = me.balance;
            }
        }

        const list = document.getElementById('my-requests-list');
        list.innerHTML = requests.map(r => `
            <div class="card">
                <strong>${escapeHtml(r.start_date)} to ${escapeHtml(r.end_date)}</strong> (${escapeHtml(r.type)})<br>
                Status: <span class="status-${r.status}">${r.status}</span><br>
                Reason: ${escapeHtml(r.reason || 'None')}
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        document.getElementById('request-msg').textContent = "Error loading requests.";
    }
}

// Manager Actions
async function loadAllRequests() {
    try {
        const res = await fetch(`/api/requests?user_id=${currentUser.id}`); // Manager ID lets backend know to show all
        if (!res.ok) throw new Error('Failed to fetch items');
        const requests = await res.json();

        // Sort so pending is first
        requests.sort((a, b) => (a.status === 'PENDING' ? -1 : 1));

        const list = document.getElementById('all-requests-list');
        list.innerHTML = requests.map(r => `
            <div class="card">
                <strong>${escapeHtml(r.employee_name)}</strong> requests ${escapeHtml(r.type)}<br>
                ${escapeHtml(r.start_date)} to ${escapeHtml(r.end_date)}<br>
                Status: <span class="status-${r.status}">${r.status}</span><br>
                Reason: ${escapeHtml(r.reason || 'None')}<br>
                <div class="${r.status !== 'PENDING' ? 'hidden' : ''}">
                    <button onclick="respond(${r.id}, 'approve')">Approve</button>
                    <button onclick="respond(${r.id}, 'reject')">Reject</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        alert('Error loading requests');
    }
}

async function respond(reqId, action) {
    const res = await fetch(`/api/requests/${reqId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: currentUser.id })
    });

    const data = await res.json();
    if (!res.ok) {
        alert(data.error);
    }
    loadAllRequests();
}

// Init
fetchUsers();
