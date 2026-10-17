const API_URL = (window.API_URL_OVERRIDE) || "https://canteen-api-1xsu.onrender.com/api";

let menuItems = [];

const api = {
    async get(endpoint) {
        try {
            const res = await fetch(`${API_URL}${endpoint}`);
            if (!res.ok) {
                console.error('API GET failed:', res.status, res.statusText);
                return null;
            }
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (jsonErr) {
                console.error('Backend returned malformed JSON (likely a backend crash/recursion):', jsonErr.message);
                return null;
            }
        } catch (e) {
            console.error('API GET error:', e);
            return null;
        }
    },
    async post(endpoint, data, options = {}) {
        try {
            const controller = new AbortController();
            const timeout = options.timeout || 15000;
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({message: res.statusText}));
                console.error('API POST failed:', res.status, errorBody);
                return { error: true, status: res.status, message: errorBody.message || res.statusText };
            }
            const result = await res.json();
            return result;
        } catch (e) {
            console.error('API POST error:', e);
            if (e.name === 'AbortError') {
                return { error: true, status: 408, message: 'Request timeout' };
            }
            return { error: true, status: 0, message: 'Network error: ' + e.message };
        }
    },
    async put(endpoint, data) {
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({message: res.statusText}));
                console.error('API PUT failed:', res.status, errorBody);
                return { error: true, status: res.status, message: errorBody.message || res.statusText };
            }
            const result = await res.json();
            return result;
        } catch (e) {
            console.error('API PUT error:', e);
            return { error: true, status: 0, message: 'Network error: ' + e.message };
        }
    },
    async patch(endpoint, data) {
        const options = {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        };
        if (data !== undefined) {
            options.body = typeof data === 'string' ? data : JSON.stringify(data);
        }
        try {
            const res = await fetch(`${API_URL}${endpoint}`, options);
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({message: res.statusText}));
                console.error('API PATCH failed:', res.status, errorBody);
                return { error: true, status: res.status, message: errorBody.message || res.statusText };
            }
            return res.status === 204 ? true : await res.json().catch(() => true);
        } catch (e) {
            console.error('API PATCH error:', e);
            return { error: true, status: 0, message: 'Network error: ' + e.message };
        }
    },
    async delete(endpoint) {
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({message: res.statusText}));
                console.error('API DELETE failed:', res.status, errorBody);
                return { error: true, status: res.status, message: errorBody.message || res.statusText };
            }
            return true;
        } catch (e) {
            console.error('API DELETE error:', e);
            return { error: true, status: 0, message: 'Network error: ' + e.message };
        }
    }
};

// Emoji mapping based on category
const categoryEmojis = {
    "Veg": ["🥗", "🍱", "🍛", "🥘", "🍝", "🥙", "🌮", "🌯", "🥦", "🥕"],
    "Non-Veg": ["🍗", "🍖", "🥩", "🥓", "🐟", "🦐", "🦑", "🦀", "🦆", "🦃"],
    "Cakes": ["🎂", "🍰", "🧁", "🍩", "🍪", "🥧", "🍮", "🎂", "🥮", "🍡"],
    "Icecreams": ["🍦", "🍧", "🍨", "🧊", "🍦", "🍧", "🍨", "🧊", "🍦", "🍧"],
    "Drinks": ["🥤", "🧃", "🍵", "☕", "🧋", "🍶", "🍷", "🍸", "🍹", "🍺"],
    "Choclates": ["🍫", "🍬", "🍭", "🍡", "🍩", "🍪", "🧁", "🍰", "🎂", "🍮"]
};

// Get random emoji for category
function getEmojiForCategory(category) {
    const emojis = categoryEmojis[category] || ["🍽️"];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// Render item icon: Pexels image URL preferred, emoji fallback
function itemIconHTML(item, isSmall) {
    if (item && item.imageUrl) {
        const sizeClass = isSmall ? 'w-6 h-6' : 'w-8 h-8';
        return `<img src="${item.imageUrl}" alt="${item.name || 'Food'}" class="${sizeClass} rounded-lg object-cover">`;
    }
    const emojiClass = isSmall ? 'text-2xl' : 'text-3xl';
    const emoji = (item && item.img) || '🍽️';
    return `<span class="${emojiClass}">${emoji}</span>`;
}

let cart = [];
let orders = [];
let adminTotalProfit = 0;
let currentUser = "";
let currentUserId = null;
let isRegisterMode = false;
let currentModalItem = null;
let currentModalCount = 1;
let selectedRestaurantName = "";
let selectedRestaurantId = null;
let recentlyCompletedOrders = new Set();

let categories = [];
let registeredUsers = [];
let registeredAdmins = [];
let canteensList = [];
let itemRatings = {};
let feedbackList = [];

/* =========================================================
   SESSION TIMING / ORDERING WINDOW
   ========================================================= */

function convertTo24Hour(time12h) {
    if (!time12h) return null;
    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes; // return minutes since midnight
}

function getCurrentSession(canteen) {
    if (!canteen) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const lunchStart = convertTo24Hour(canteen.lunchStart);
    const lunchEnd = convertTo24Hour(canteen.lunchEnd);
    const eveningStart = convertTo24Hour(canteen.eveningStart);
    const eveningEnd = convertTo24Hour(canteen.eveningEnd);

    if (lunchStart !== null && lunchEnd !== null && nowMinutes >= lunchStart && nowMinutes < lunchEnd) {
        return 'LUNCH';
    }
    if (eveningStart !== null && eveningEnd !== null && nowMinutes >= eveningStart && nowMinutes < eveningEnd) {
        return 'EVENING';
    }
    return null;
}

function isOrderingAllowed() {
    if (!selectedRestaurantId) return false;
    const canteen = canteensList.find(c => c.id === selectedRestaurantId);
    if (!canteen) return false;
    const session = getCurrentSession(canteen);
    return session !== null;
}

function getCurrentSessionLabel() {
    if (!selectedRestaurantId) return '';
    const canteen = canteensList.find(c => c.id === selectedRestaurantId);
    if (!canteen) return '';
    const session = getCurrentSession(canteen);
    if (session === 'LUNCH') return `🍱 Lunch Session (${canteen.lunchStart || '09:00 AM'} - ${canteen.lunchEnd || '02:00 PM'})`;
    if (session === 'EVENING') return `🌙 Evening Session (${canteen.eveningStart || '01:30 PM'} - ${canteen.eveningEnd || '08:00 PM'})`;
    if (canteen.lunchStart && canteen.lunchEnd && canteen.eveningStart && canteen.eveningEnd) {
        return `⏰ Ordering Closed - Lunch: ${canteen.lunchStart}-${canteen.lunchEnd} | Evening: ${canteen.eveningStart}-${canteen.eveningEnd}`;
    }
    return '';
}

function renderSessionBanner() {
    const banner = document.getElementById('sessionBanner');
    if (!banner) return;
    const label = getCurrentSessionLabel();
    if (label) {
        banner.innerHTML = label;
        banner.classList.remove('hidden');
        if (label.includes('Closed')) {
            banner.className = 'w-full text-center py-2 px-4 text-xs font-bold bg-red-100 text-red-700 border-b border-red-200';
        } else if (label.includes('Lunch')) {
            banner.className = 'w-full text-center py-2 px-4 text-xs font-bold bg-orange-100 text-orange-700 border-b border-orange-200';
        } else if (label.includes('Evening')) {
            banner.className = 'w-full text-center py-2 px-4 text-xs font-bold bg-blue-100 text-blue-700 border-b border-blue-200';
        }
    } else {
        banner.classList.add('hidden');
    }
}

/* =========================================================
   ORDER FEEDBACK FUNCTIONS
   ========================================================= */

let orderFeedbackTargetId = null;

function showOrderFeedbackModal(orderId) {
    orderFeedbackTargetId = orderId;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    document.getElementById('orderFeedbackItemName').innerText = `Order #${order.id}`;
    document.getElementById('orderFeedbackStarsInput').innerHTML = [1,2,3,4,5].map(n =>
        `<i class="far fa-star cursor-pointer text-2xl text-gray-300 hover:text-yellow-400" data-star="${n}" onclick="setOrderFeedbackRating(${n})"></i>`
    ).join('');
    document.getElementById('orderFeedbackComment').value = '';
    orderFeedbackSelectedRating = 0;
    document.getElementById('orderFeedbackModal').classList.remove('hidden');
}

let orderFeedbackSelectedRating = 0;

function setOrderFeedbackRating(n) {
    orderFeedbackSelectedRating = n;
    const stars = document.getElementById('orderFeedbackStarsInput').children;
    for (let i = 0; i < stars.length; i++) {
        stars[i].className = i < n
            ? 'fas fa-star cursor-pointer text-2xl text-yellow-400'
            : 'far fa-star cursor-pointer text-2xl text-gray-300 hover:text-yellow-400';
    }
}

async function submitOrderFeedback() {
    if (!orderFeedbackSelectedRating) {
        alert('Please select a rating');
        return;
    }
    const comment = document.getElementById('orderFeedbackComment').value.trim();
    const order = orders.find(o => o.id === orderFeedbackTargetId);
    if (!order) {
        alert('Order not found');
        return;
    }
    // Submit feedback for each item in the order
    if (order.items && order.items.length > 0) {
        for (const item of order.items) {
            // Find menuItem id by name
            const menuItem = menuItems.find(mi => mi.name === item.name);
            if (menuItem && selectedRestaurantId) {
                const payload = {
                    username: currentUser || 'Anonymous',
                    rating: orderFeedbackSelectedRating,
                    comment: comment ? `${comment} (Order #${order.id})` : `Order #${order.id}`,
                    itemId: menuItem.id
                };
                await api.post(`/canteens/${selectedRestaurantId}/feedback`, payload);
            }
        }
    }
    await loadFeedback();
    document.getElementById('orderFeedbackModal').classList.add('hidden');
    alert('Thank you for your feedback!');
    if (!document.getElementById('ownerDashboard').classList.contains('hidden')) {
        renderOwnerFeedback();
    }
    updateCartOrdersPage();
    updateOrderHistoryPage();
}

function closeOrderFeedbackModal() {
    document.getElementById('orderFeedbackModal').classList.add('hidden');
    orderFeedbackTargetId = null;
}

/* =========================================================
   SESSION / MULTI-PAGE NAVIGATION / IDLE AUTO-LOGOUT
   ========================================================= */

// How long (ms) a logged-in user can stay idle before auto-logout.
// 15 minutes of no activity. Adjust as needed.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
// How often (ms) the idle countdown warning is refreshed.
const IDLE_WARNING_MS = 60 * 1000;

let _idleTimer = null;
let _idleWarningShown = false;

function getActiveView() {
    return (localStorage.getItem('currentView') || '').trim();
}

function setActiveView(view) {
    try { localStorage.setItem('currentView', view || ''); } catch (e) {}
}

function persistSession() {
    try {
        localStorage.setItem('sessionUser', currentUser || '');
        localStorage.setItem('sessionUserId', currentUserId != null ? String(currentUserId) : '');
        localStorage.setItem('sessionRestroName', selectedRestaurantName || '');
        localStorage.setItem('sessionRestroId', selectedRestaurantId != null ? String(selectedRestaurantId) : '');
    } catch (e) {}
}

// Persist cart + orders so they survive navigation between separate HTML pages.
function saveCartOrders() {
    try {
        localStorage.setItem('cart', JSON.stringify(cart || []));
        localStorage.setItem('orders', JSON.stringify(orders || []));
    } catch (e) {}
}

function loadCartOrders() {
    try {
        const c = localStorage.getItem('cart');
        if (c) cart = JSON.parse(c);
        const o = localStorage.getItem('orders');
        if (o) orders = JSON.parse(o);
    } catch (e) {}
}

function restoreSession() {
    try {
        currentUser = localStorage.getItem('sessionUser') || '';
        const uid = localStorage.getItem('sessionUserId');
        currentUserId = uid ? Number(uid) : null;
        selectedRestaurantName = localStorage.getItem('sessionRestroName') || '';
        const rid = localStorage.getItem('sessionRestroId');
        selectedRestaurantId = rid ? Number(rid) : null;
    } catch (e) {}
}

function isLoggedIn() {
    return !!currentUser;
}

// Navigate to another page of the app, persisting the current view + session first.
function navigateTo(page) {
    persistSession();
    setActiveView(page);
    window.location.href = page + '.html';
}

// Reset the idle timer (called on any user activity while logged in)
function resetIdleTimer() {
    if (!isLoggedIn()) {
        stopIdleTimer();
        return;
    }
    _idleWarningShown = false;
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(performIdleLogout, IDLE_TIMEOUT_MS);
}

function stopIdleTimer() {
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    _idleWarningShown = false;
    const warn = document.getElementById('idleWarning');
    if (warn) warn.classList.add('hidden');
}

async function performIdleLogout() {
    stopIdleTimer();
    alert('You have been logged out due to inactivity.');
    logout();
    if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
        window.location.href = 'index.html';
    }
}

// Activity listeners only reset the timer when logged in.
const _idleActivityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
function _idleActivityHandler() { resetIdleTimer(); }
_idleActivityEvents.forEach(ev => document.addEventListener(ev, _idleActivityHandler, { passive: true }));

// Decide which view to show on page load based on body[data-page] + saved session.
async function initPage() {
    const body = document.body;
    const page = (body && body.getAttribute('data-page')) || 'landing';

    if (page !== 'landing') {
        // Protected / sub pages require a session.
        restoreSession();
        loadCartOrders();
    }

    const landing = document.getElementById('landingPage');
    const userLogin = document.getElementById('userLoginPage');
    const userRegister = document.getElementById('userRegisterPage');
    const adminLogin = document.getElementById('adminLoginPage');
    const restaurantSelect = document.getElementById('restaurantSelectPage');
    const studentDashboard = document.getElementById('studentDashboard');
    const cartOrders = document.getElementById('cartOrdersPage');
    const checkout = document.getElementById('checkoutPage');
    const orderHistory = document.getElementById('orderHistoryPage');
    const feedback = document.getElementById('feedbackPage');
    const ownerDashboard = document.getElementById('ownerDashboard');
    const superAdmin = document.getElementById('superAdminDashboard');

    function hideAll() {
        [landing, userLogin, userRegister, adminLogin, restaurantSelect,
         studentDashboard, cartOrders, checkout, orderHistory, feedback,
         ownerDashboard, superAdmin].forEach(el => { if (el) el.classList.add('hidden'); });
    }

    // Mobile-menu / modal overlays that belong only to specific pages
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) mobileMenu.classList.add('closed');

    if (page === 'landing') {
        if (landing) landing.classList.remove('hidden');
        return;
    }

    // For protected pages, if not logged in, bounce to landing.
    if (!isLoggedIn() && page !== 'landing') {
        if (landing) landing.classList.remove('hidden');
        return;
    }

    hideAll();

    if (page === 'restaurants') {
        await loadCanteens().catch(() => {});
        if (restaurantSelect) restaurantSelect.classList.remove('hidden');
        renderRestaurantSelection();
    } else if (page === 'menu') {
        if (studentDashboard) {
            studentDashboard.classList.remove('hidden');
            const activeRestro = document.getElementById('activeRestroName');
            const dispUser = document.getElementById('displayUserName');
            if (activeRestro) activeRestro.innerText = selectedRestaurantName ? '| ' + selectedRestaurantName : '';
            if (dispUser) dispUser.innerText = currentUser;
        }
        renderSessionBanner();
        loadMenuItems().then(async () => {
            await loadCategories();
            await loadFeedback();
            updateCategoryFilterButtons();
            renderMenu();
            updateCartUI();
            updateStudentOrders();
            updateCartOrdersPage();
            syncOrders().then(() => { updateStudentOrders(); updateCartOrdersPage(); });
        });
    } else if (page === 'cart') {
        if (cartOrders) cartOrders.classList.remove('hidden');
        renderSessionBanner();
        syncOrders().then(() => syncOrders()).then(() => loadFeedback()).then(() => {
            updateCartUI();
            updateCartOrdersPage();
        });
    } else if (page === 'checkout') {
        if (checkout) checkout.classList.remove('hidden');
        if (cartOrders) cartOrders.classList.add('hidden');
        renderSessionBanner();
        openCheckoutPage();
    } else if (page === 'history') {
        if (orderHistory) orderHistory.classList.remove('hidden');
        updateOrderHistoryPage();
    } else if (page === 'feedback') {
        if (feedback) feedback.classList.remove('hidden');
        loadFeedback().then(() => renderFeedbackPage());
    } else if (page === 'admin') {
        if (ownerDashboard) {
            ownerDashboard.classList.remove('hidden');
            const dispAdmin = document.getElementById('displayAdminName');
            if (dispAdmin) dispAdmin.innerText = currentUser;
            const adminCanteen = document.getElementById('adminCanteenName');
            if (adminCanteen) adminCanteen.innerText = selectedRestaurantName || '';
        }
        loadMenuItems().then(async () => {
            await loadCategories();
            await loadFeedback();
            updateCategoryDropdowns();
            syncOrders().then(() => updateAdminUI());
            loadFeedback().then(() => renderOwnerFeedback());
            loadAdminSessionConfig();
        });
    } else if (page === 'superadmin') {
        if (superAdmin) superAdmin.classList.remove('hidden');
        Promise.all([loadCanteens(), loadAdmins(), loadUsers()]).then(() => {
            syncOrders().then(() => renderSuperAdminData());
        });
    }

    // Start idle auto-logout protection on any logged-in page.
    resetIdleTimer();
}

// Run page init once the DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}

async function loadCanteens() {
    try {
        const canteens = await api.get('/canteens');
        if (canteens && Array.isArray(canteens)) {
            canteensList = canteens.map(c => ({
                id: c.id,
                name: c.name,
                location: c.location,
                isActive: c.isActive,
                lunchStart: c.lunchStart,
                lunchEnd: c.lunchEnd,
                eveningStart: c.eveningStart,
                eveningEnd: c.eveningEnd
            }));
        } else {
            throw new Error('Invalid canteens data received');
        }
    } catch (e) {
        console.error('Failed to load canteens from database:', e);
        canteensList = [];
    }
    renderRestaurantSelection();
}

async function loadAdmins() {
    try {
        const admins = await api.get('/admins');
        if (admins && Array.isArray(admins)) {
            registeredAdmins = admins.map(a => ({
                id: a.id,
                name: a.name,
                email: a.email,
                password: a.password,
                canteen: a.canteen
            }));
        } else {
            throw new Error('Invalid admins data received');
        }
    } catch (e) {
        console.error('Failed to load admins from database:', e);
        registeredAdmins = [];
    }
}

async function loadUsers() {
    try {
        const users = await api.get('/users');
        if (users && Array.isArray(users)) {
            registeredUsers = users.map(u => ({
                id: u.id,
                name: u.username,
                rollNo: u.phone,
                email: u.email,
                password: u.password
            }));
        } else {
            throw new Error('Invalid users data received');
        }
    } catch (e) {
        console.error('Failed to load users from database:', e);
        registeredUsers = [];
    }
}

async function loadCategories() {
    try {
        const items = await api.get(`/canteens/${selectedRestaurantId || 1}/menu`);
        if (items && Array.isArray(items)) {
            const uniqueCats = [...new Set(items.map(i => i.category))];
            categories = uniqueCats.length > 0 ? uniqueCats : ['Veg', 'Non-Veg', 'Cakes', 'Icecreams', 'Drinks', 'Choclates'];
        } else {
            categories = ['Veg', 'Non-Veg', 'Cakes', 'Icecreams', 'Drinks', 'Choclates'];
        }
    } catch (e) {
        categories = ['Veg', 'Non-Veg', 'Cakes', 'Icecreams', 'Drinks', 'Choclates'];
    }
}

loadCanteens();
loadAdmins();
loadUsers();
// Do not call loadCategories() on page load - it needs selectedRestaurantId
// loadMenuItems(); // Moved to when a restaurant is selected

// Toggle Password Visibility
function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// Add Admin Modal Functions
function showAddAdminModal() {
    const activeCanteens = canteensList.filter(c => c.isActive);
    const canteenSelect = document.getElementById('newAdminCanteen');
    if (canteenSelect) {
        canteenSelect.innerHTML = activeCanteens.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        if (activeCanteens.length === 0) {
            canteenSelect.innerHTML = '<option value="">No active canteens available</option>';
        }
    }
    document.getElementById('addAdminModal').classList.remove('hidden');
}

function hideAddAdminModal() {
    document.getElementById('addAdminModal').classList.add('hidden');
    document.getElementById('addAdminForm').reset();
}

// Add Admin Form Handler
document.getElementById('addAdminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newAdminName').value;
    const email = document.getElementById('newAdminEmail').value;
    const password = document.getElementById('newAdminPass').value;
    const canteen = document.getElementById('newAdminCanteen').value;
    
    if (!name || !email || !password || !canteen) {
        alert('Please fill all fields');
        return;
    }
    
    const newAdmin = { name, email, password, canteen };
    const result = await api.post('/admins', newAdmin);
    
    if (result && result.id) {
        alert('Admin added successfully!');
    } else {
        alert('Failed to add admin. Please try again.');
    }
    
    hideAddAdminModal();
    loadAdmins();
});

// Edit Admin Form Handler
document.getElementById('editAdminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const index = document.getElementById('editAdminIndex').value;
    const name = document.getElementById('editAdminName').value;
    const email = document.getElementById('editAdminEmail').value;
    const password = document.getElementById('editAdminPass').value;
    const canteen = document.getElementById('editAdminCanteen').value;

    if (!name || !email || !canteen) {
        alert('Please fill all required fields');
        return;
    }

    const admin = registeredAdmins[parseInt(index)];
    if (!admin) return;

    const payload = {
        name,
        email,
        password: password || admin.password,
        canteen
    };

    const result = await api.put(`/admins/${admin.id}`, payload);
    if (result) {
        alert('Admin updated successfully!');
        hideEditAdminModal();
        await loadAdmins();
        renderSuperAdminData();
    } else {
        alert('Failed to update admin. Please try again.');
    }
});

function showEditAdminModal(index) {
    const admin = registeredAdmins[index];
    document.getElementById('editAdminIndex').value = index;
    document.getElementById('editAdminName').value = admin.name;
    document.getElementById('editAdminEmail').value = admin.email;
    document.getElementById('editAdminPass').value = '';

    const canteenSelect = document.getElementById('editAdminCanteen');
    if (canteenSelect) {
        canteenSelect.innerHTML = canteensList.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        canteenSelect.value = admin.canteen || (canteensList.length > 0 ? canteensList[0].name : '');
    } else {
        const input = document.getElementById('editAdminCanteen');
        if (input) input.value = admin.canteen || (canteensList.length > 0 ? canteensList[0].name : '');
    }

    document.getElementById('editAdminModal').classList.remove('hidden');
}

function hideEditAdminModal() {
    document.getElementById('editAdminModal').classList.add('hidden');
    document.getElementById('editAdminForm').reset();
}

// Add Canteen Modal Functions
function showAddCanteenModal() {
    document.getElementById('addCanteenModal').classList.remove('hidden');
}

function hideAddCanteenModal() {
    document.getElementById('addCanteenModal').classList.add('hidden');
    document.getElementById('addCanteenForm').reset();
}

// Add Canteen Form Handler
document.getElementById('addCanteenForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newCanteenName').value;
    const location = document.getElementById('newCanteenLocation').value;
    const isActiveStr = document.getElementById('newCanteenActive')?.value || 'true';
    const isActive = isActiveStr === 'true';

    if (!name || !location) {
        alert('Please fill all fields');
        return;
    }

    try {
        const newCanteen = await api.post('/canteens', { name, location, isActive });
        if (newCanteen && newCanteen.id) {
            canteensList.push({ id: newCanteen.id, name: newCanteen.name, location: newCanteen.location, isActive });
        }
    } catch (e) {
        const newId = canteensList.length > 0 ? Math.max(...canteensList.map(c => c.id)) + 1 : 1;
        canteensList.push({ id: newId, name, location, isActive });
    }

    alert('Canteen added successfully!');
    hideAddCanteenModal();
    renderSuperAdminData();
});

// Edit Canteen Modal Functions
function showEditCanteenModal(index) {
    const canteen = canteensList[index];
    if (!canteen) return;

    document.getElementById('editCanteenId').value = canteen.id;
    document.getElementById('editCanteenName').value = canteen.name;
    document.getElementById('editCanteenLocation').value = canteen.location || '';
    document.getElementById('editCanteenActive').value = canteen.isActive ? 'true' : 'false';

    document.getElementById('editCanteenModal').classList.remove('hidden');
}

function hideEditCanteenModal() {
    document.getElementById('editCanteenModal').classList.add('hidden');
    document.getElementById('editCanteenForm').reset();
}

document.getElementById('editCanteenForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('editCanteenId').value);
    const name = document.getElementById('editCanteenName').value;
    const location = document.getElementById('editCanteenLocation').value;
    const isActive = document.getElementById('editCanteenActive').value === 'true';

    if (!name || !location) {
        alert('Please fill all fields');
        return;
    }

    try {
        const updated = await api.put(`/canteens/${id}`, { name, location, isActive });
        if (updated) {
            const idx = canteensList.findIndex(c => c.id === id);
            if (idx !== -1) {
                canteensList[idx] = { ...canteensList[idx], name, location, isActive };
            }
            renderSuperAdminData();
            alert('Canteen updated successfully!');
            hideEditCanteenModal();
        } else {
            alert('Failed to update canteen.');
        }
    } catch (err) {
        alert('Failed to update canteen.');
    }
});

// Add Item Modal Functions
function showAddItemModal() {
    document.getElementById('addItemModal').classList.remove('hidden');
}

function hideAddItemModal() {
    document.getElementById('addItemModal').classList.add('hidden');
    document.getElementById('addItemForm').reset();
}

// Category Management Functions
function showAddCategoryModal() {
    document.getElementById('addCategoryModal').classList.remove('hidden');
}

function hideAddCategoryModal() {
    document.getElementById('addCategoryModal').classList.add('hidden');
    document.getElementById('addCategoryForm').reset();
}

// Add Category Form Handler
document.getElementById('addCategoryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('newCategoryName').value.trim();
    
    if (!name) {
        alert('Please enter category name');
        return;
    }
    
    if (categories.includes(name)) {
        alert('Category already exists');
        return;
    }
    
    categories.push(name);
    
    alert('Category added successfully!');
    hideAddCategoryModal();
    renderCategoryList();
    updateCategoryDropdowns();
});

// Render category list in admin dashboard
function renderCategoryList() {
    const container = document.getElementById('categoryList');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-500 py-10 border-2 border-dashed border-slate-800 rounded-3xl">
            <p class="text-sm">No categories</p>
            <p class="text-xs text-slate-600 mt-2">Add categories using the form above</p>
        </div>`;
        return;
    }
    
    container.innerHTML = categories.map(cat => {
        const itemCount = menuItems.filter(item => item.cat === cat || item.category === cat).length;
        return `
            <div class="card-dark p-4 rounded-2xl flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">🏷️</span>
                    <div>
                        <h4 class="font-bold text-sm text-white">${cat}</h4>
                        <p class="text-xs text-slate-400">${itemCount} item${itemCount !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <button onclick="deleteCategory('${cat}')" class="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg transition"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }).join('');
}

// Delete category and all items with that category
function deleteCategory(categoryName) {
    if (!confirm(`Are you sure you want to delete "${categoryName}" category? All items in this category will also be removed.`)) return;
    
    const catIndex = categories.indexOf(categoryName);
    if (catIndex > -1) {
        categories.splice(catIndex, 1);
    }
    
    const itemsToRemove = menuItems.filter(item => item.cat === categoryName);
    itemsToRemove.forEach(item => {
        const itemIndex = menuItems.findIndex(i => i.id === item.id);
        if (itemIndex > -1) {
            menuItems.splice(itemIndex, 1);
        }
    });
    
    alert(`Category "${categoryName}" and ${itemsToRemove.length} item(s) deleted successfully!`);
    renderCategoryList();
    renderMenuItemsList();
    updateCategoryDropdowns();
    
    if (!document.getElementById('studentDashboard').classList.contains('hidden')) {
        renderMenu();
    }
}

// Update category dropdowns in add/edit item forms
function updateCategoryDropdowns() {
    const addItemDropdown = document.getElementById('newItemCategory');
    const editItemDropdown = document.getElementById('editItemCategory');
    
    if (addItemDropdown) {
        addItemDropdown.innerHTML = '<option value="">Select Category</option>' + 
            categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
    
    if (editItemDropdown) {
        editItemDropdown.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
}

// Add Item Form Handler (Modal)
document.getElementById('addItemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const name = document.getElementById('newItemName').value;
    const price = parseFloat(document.getElementById('newItemPrice').value);
    const category = document.getElementById('newItemCategory').value;
    
    if (!name || !price || !category) {
        alert('Please fill all fields');
        return;
    }
    
    const slot = document.getElementById('newItemSlot') ? document.getElementById('newItemSlot').value : 'BOTH';
    
    const newItemData = {
        name: name,
        price: price,
        category: category,
        emoji: getEmojiForCategory(category),
        stockQuantity: parseInt(document.getElementById('newItemStock').value) || 0,
        available: (parseInt(document.getElementById('newItemStock').value) || 0) > 0,
        slot: slot
    };
    
    const result = await api.post(`/canteens/${selectedRestaurantId}/menu`, newItemData);
    if (result) {
        alert('Item added successfully!');
        hideAddItemModal();
        await loadMenuItems();
        renderMenuItemsList();
        if (!document.getElementById('studentDashboard').classList.contains('hidden')) {
            renderMenu();
        }
    } else {
        alert('Failed to save item to database.');
    }
});



// Load menu items from API on page load
async function loadMenuItems() {
    try {
        const items = await api.get(`/canteens/${selectedRestaurantId || 1}/menu`);
        if (items && Array.isArray(items)) {
            menuItems = items.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                cat: item.category,
                img: item.emoji || '🍽️',
                imageUrl: item.imageUrl || item.image_url || null,
                available: item.available,
                stockQuantity: item.stockQuantity,
                slot: item.slot || 'BOTH'
            }));
        } else {
            throw new Error('Invalid menu data received');
        }
    } catch (e) {
        console.error('Failed to load menu items from database:', e);
        menuItems = [];
    }
}

// Render menu items list in admin dashboard
function renderMenuItemsList() {
    const container = document.getElementById('menuItemsList');
    if (!container) return;
    
    if (menuItems.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-500 py-10 border-2 border-dashed border-slate-800 rounded-3xl">
            <p class="text-sm">No menu items</p>
            <p class="text-xs text-slate-600 mt-2">Add items using the form above</p>
        </div>`;
        return;
    }
    
    container.innerHTML = menuItems.map(item => {
        let slotBadge = '';
        if (item.slot === 'LUNCH') {
            slotBadge = '<span class="text-[9px] text-orange-400">🌤 Lunch</span>';
        } else if (item.slot === 'EVENING') {
            slotBadge = '<span class="text-[9px] text-indigo-400">🌙 Evening</span>';
        } else {
            slotBadge = '<span class="text-[9px] text-slate-400">Both</span>';
        }
        return `
            <div class="card-dark p-4 rounded-2xl flex justify-between items-center">
                <div class="flex items-center gap-3">
                    ${itemIconHTML(item)}
                    <div>
                        <h4 class="font-bold text-sm text-white">${item.name}</h4>
                        <p class="text-orange-400 font-bold text-xs">₹${item.price}</p>
                        <span class="text-[10px] text-slate-400 uppercase">${item.cat}</span>
                        <p class="text-[10px] ${item.stockQuantity > 0 ? 'text-green-400' : 'text-red-400'}">Stock: ${item.stockQuantity || 0}</p>
                        ${slotBadge}
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="showEditItemModal(${item.id})" class="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteMenuItem(${item.id})" class="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg transition"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

// Show edit item modal
function showEditItemModal(id) {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    
    document.getElementById('editItemIndex').value = id;
    document.getElementById('editItemName').value = item.name;
    document.getElementById('editItemPrice').value = item.price;
    document.getElementById('editItemCategory').value = item.cat;
    document.getElementById('editItemStock').value = item.stockQuantity || 0;
    const slotSelect = document.getElementById('editItemSlot');
    if (slotSelect) {
        slotSelect.value = item.slot || 'BOTH';
    }
    document.getElementById('editItemModal').classList.remove('hidden');
}

// Hide edit item modal
function hideEditItemModal() {
    document.getElementById('editItemModal').classList.add('hidden');
    document.getElementById('editItemForm').reset();
}

// Edit item form handler
document.getElementById('editItemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const id = parseInt(document.getElementById('editItemIndex').value);
    const name = document.getElementById('editItemName').value;
    const price = parseFloat(document.getElementById('editItemPrice').value);
    const category = document.getElementById('editItemCategory').value;
    
    if (!name || !price || !category) {
        alert('Please fill all fields');
        return;
    }
    
    const itemIndex = menuItems.findIndex(i => i.id === id);
    if (itemIndex === -1) return;
    
    const slot = document.getElementById('editItemSlot') ? document.getElementById('editItemSlot').value : 'BOTH';
    
    const updatedItem = {
        name: name,
        price: price,
        category: category,
        emoji: getEmojiForCategory(category),
        stockQuantity: parseInt(document.getElementById('editItemStock').value) || 0,
        slot: slot
    };
    
    const result = await api.put(`/canteens/${selectedRestaurantId}/menu/${id}`, updatedItem);
    if (result) {
        alert('Item updated successfully!');
        hideEditItemModal();
        await loadMenuItems();
        renderMenuItemsList();
        if (!document.getElementById('studentDashboard').classList.contains('hidden')) {
            renderMenu();
        }
    } else {
        alert('Failed to update item on server.');
    }
});

// Delete menu item
async function deleteMenuItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    const success = await api.delete(`/canteens/${selectedRestaurantId}/menu/${id}`);
    if (success) {
        alert('Item deleted successfully!');
        await loadMenuItems();
        renderMenuItemsList();
        if (!document.getElementById('studentDashboard').classList.contains('hidden')) {
            renderMenu();
        }
    } else {
        alert('Failed to delete item from server.');
    }
}

async function deleteAdmin(index) {
    if (confirm('Are you sure you want to delete this admin?')) {
        const admin = registeredAdmins[index];
        const success = await api.delete(`/admins/${admin.id || admin.email}`);
        if (success) {
            await loadAdmins();
            renderSuperAdminData();
        } else {
            alert('Failed to delete admin from server. Please try again.');
        }
    }
}

async function deleteUser(index) {
    if (confirm('Are you sure you want to delete this user?')) {
        const user = registeredUsers[index];
        const success = await api.delete(`/users/${user.id}`);
        if (success) {
            await loadUsers();
            renderSuperAdminData();
        } else {
            alert('Failed to delete user from server. Please try again.');
        }
    }
}


async function toggleCanteenActive(index) {
    const canteen = canteensList[index];
    if (!canteen) return;

    const newState = !canteen.isActive;
    if (!confirm(`Mark this canteen as ${newState ? 'ACTIVE' : 'INACTIVE'}?`)) return;

    try {
        const result = await api.put(`/canteens/${canteen.id}`, { isActive: newState });
        if (result) {
            canteen.isActive = newState;
            renderSuperAdminData();
            alert(`Canteen marked as ${newState ? 'ACTIVE' : 'INACTIVE'}`);
        } else {
            alert('Failed to update canteen status on server.');
        }
    } catch (e) {
        alert('Failed to update canteen status on server.');
    }
}

async function deleteCanteen(index) {
    if (confirm('Are you sure you want to delete this canteen?')) {
        const canteen = canteensList[index];
        const success = await api.delete(`/canteens/${canteen.id}`);
        if (success) {
            await loadCanteens();
            renderSuperAdminData();
        } else {
            alert('Failed to delete canteen from server. Please try again.');
        }
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const icon = document.getElementById('themeIcon');
    const mobileIcon = document.getElementById('mobileThemeIcon');
    
    if(document.body.classList.contains('dark-mode')) {
        if(icon) icon.className = 'fas fa-sun';
        if(mobileIcon) mobileIcon.className = 'fas fa-sun';
    } else {
        if(icon) icon.className = 'fas fa-moon';
        if(mobileIcon) mobileIcon.className = 'fas fa-moon';
    }
}

// ---------- Feedback & Ratings ----------
function getStarsHTML(rating, max = 5) {
    let html = '';
    for (let i = 1; i <= max; i++) {
        html += `<i class="fas fa-star ${i <= rating ? 'text-yellow-400' : 'text-gray-300'}"></i>`;
    }
    return html;
}

async function loadFeedback() {
    if (!selectedRestaurantId) return;
    try {
        const data = await api.get(`/canteens/${selectedRestaurantId}/feedback`);
        if (data && Array.isArray(data)) {
            feedbackList = data;
            itemRatings = {};
            data.forEach(f => {
                if (f.menuItem && f.menuItem.id) {
                    if (!itemRatings[f.menuItem.id]) itemRatings[f.menuItem.id] = [];
                    itemRatings[f.menuItem.id].push(f);
                }
            });
        }
    } catch (e) {
        console.error('Failed to load feedback:', e);
    }
}

function getAverageRating(itemId) {
    const list = itemRatings[itemId] || [];
    if (!list.length) return { average: 0, count: 0 };
    const sum = list.reduce((acc, f) => acc + (f.rating || 0), 0);
    return { average: Math.round((sum / list.length) * 10) / 10, count: list.length };
}

function ratingBadgeHTML(itemId) {
    const { average, count } = getAverageRating(itemId);
    if (count === 0) {
        return `<span class="text-[10px] text-slate-400"><i class="far fa-star"></i> No ratings</span>`;
    }
    return `<span class="flex items-center gap-1 text-[10px] text-slate-500">
        ${getStarsHTML(Math.round(average))}
        <span class="font-bold text-orange-500">${average}</span>
        <span class="text-slate-400">(${count})</span>
    </span>`;
}

function showFeedbackModal(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('feedbackItemId').value = itemId;
    document.getElementById('feedbackItemName').innerText = item.name;
    document.getElementById('feedbackStarsInput').innerHTML = [1,2,3,4,5].map(n =>
        `<i class="far fa-star cursor-pointer text-2xl text-gray-300 hover:text-yellow-400" data-star="${n}" onclick="setFeedbackRating(${n})"></i>`
    ).join('');
    document.getElementById('feedbackComment').value = '';
    feedbackSelectedRating = 0;
    renderFeedbackListForItem(itemId);
    document.getElementById('feedbackModal').classList.remove('hidden');
}

function setFeedbackRating(n) {
    feedbackSelectedRating = n;
    const stars = document.getElementById('feedbackStarsInput').children;
    for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (i < n) {
            star.className = 'fas fa-star cursor-pointer text-2xl text-yellow-400';
        } else {
            star.className = 'far fa-star cursor-pointer text-2xl text-gray-300 hover:text-yellow-400';
        }
    }
}

let feedbackSelectedRating = 0;

function renderFeedbackListForItem(itemId) {
    const container = document.getElementById('feedbackListForItem');
    if (!container) return;
    const list = (itemRatings[itemId] || []).slice().reverse();
    if (!list.length) {
        container.innerHTML = `<p class="text-xs text-gray-400 text-center py-4">No reviews yet. Be the first!</p>`;
        return;
    }
    container.innerHTML = list.map(f => `
        <div class="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-gray-700">${f.username || 'Anonymous'}</span>
                <span class="text-xs">${getStarsHTML(f.rating)}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">${f.comment ? escapeHTML(f.comment) : '<span class="text-gray-400 italic">No comment</span>'}</p>
        </div>
    `).join('');
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function submitFeedback() {
    const itemId = parseInt(document.getElementById('feedbackItemId').value);
    const comment = document.getElementById('feedbackComment').value.trim();
    if (!feedbackSelectedRating) {
        alert('Please select a rating');
        return;
    }
    if (!selectedRestaurantId) {
        alert('No canteen selected');
        return;
    }
    const payload = {
        username: currentUser || 'Anonymous',
        rating: feedbackSelectedRating,
        comment: comment,
        itemId: itemId
    };
    const result = await api.post(`/canteens/${selectedRestaurantId}/feedback`, payload);
    if (result && !result.error) {
        await loadFeedback();
        renderFeedbackListForItem(itemId);
        renderMenu();
        if (!document.getElementById('ownerDashboard').classList.contains('hidden')) {
            renderOwnerFeedback();
        }
        setFeedbackRating(0);
        document.getElementById('feedbackComment').value = '';
        alert('Thank you for your feedback!');
    } else {
        alert('Failed to submit feedback. Please try again.');
    }
}

function closeFeedbackModal() {
    document.getElementById('feedbackModal').classList.add('hidden');
}

function openFeedbackPage() {
    persistSession();
    navigateTo('feedback');
}

function closeFeedbackPage() {
    persistSession();
    navigateTo('menu');
}

function renderFeedbackPage() {
    const container = document.getElementById('feedbackPageList');
    if (!container) return;
    if (!feedbackList.length) {
        container.innerHTML = `<div class="text-center text-gray-500 py-20">
            <i class="far fa-comment-dots text-5xl mb-4 text-orange-300"></i>
            <p class="text-lg">No feedback yet</p>
            <p class="text-sm mt-2">Rate a menu item to share your experience.</p>
        </div>`;
        return;
    }
    container.innerHTML = feedbackList.slice().reverse().map(f => {
        const itemName = f.menuItem ? f.menuItem.name : (f.canteen ? f.canteen.name : 'Canteen');
        return `
        <div class="bg-white p-4 rounded-2xl shadow-sm border text-black">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-sm">${itemName}</h3>
                    <p class="text-[10px] text-orange-500 font-bold uppercase">${f.canteen ? f.canteen.name : ''}</p>
                </div>
                <span class="text-sm">${getStarsHTML(f.rating)}</span>
            </div>
            <p class="text-xs text-gray-600 mt-2">${f.comment ? escapeHTML(f.comment) : '<span class="text-gray-400 italic">No comment</span>'}</p>
            <p class="text-[10px] text-gray-400 mt-2">by ${f.username || 'Anonymous'} • ${f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ''}</p>
        </div>`;
    }).join('');
}

async function renderOwnerFeedback() {
    const container = document.getElementById('ownerFeedbackList');
    if (!container) return;
    const canteen = canteenNameEl_safe(selectedRestaurantName);
    const list = feedbackList.filter(f => !canteen || (f.canteen && f.canteen.name === selectedRestaurantName));
    if (!list.length) {
        container.innerHTML = `<div class="text-center text-slate-500 py-10 border-2 border-dashed border-slate-800 rounded-3xl">
            <p class="text-sm">No feedback yet</p>
        </div>`;
        return;
    }
    container.innerHTML = list.slice().reverse().map(f => {
        const itemName = f.menuItem ? f.menuItem.name : 'Canteen';
        return `
        <div class="card-dark p-4 rounded-2xl">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-orange-400 text-sm">${itemName}</h4>
                    <span class="text-[10px] text-slate-400 uppercase">by ${f.username || 'Anonymous'}</span>
                </div>
                <span class="text-sm">${getStarsHTML(f.rating)}</span>
            </div>
            <p class="text-xs text-slate-300 mt-2">${f.comment ? escapeHTML(f.comment) : '<span class="text-slate-500 italic">No comment</span>'}</p>
        </div>`;
    }).join('');
}

function canteenNameEl_safe(name) { return name; }

// Show page function for navigation
function showPage(pageName) {
    // Hide all pages
    const pages = ['landingPage', 'developersPage', 'userLoginPage', 'userRegisterPage', 
                   'adminLoginPage', 'studentDashboard', 'restaurantSelectPage', 
                   'cartOrdersPage', 'checkoutPage', 'orderHistoryPage'];
    
    pages.forEach(page => {
        const element = document.getElementById(page);
        if(element) element.classList.add('hidden');
    });
    
    // Show the requested page
    const targetPage = document.getElementById(pageName);
    if(targetPage) {
        targetPage.classList.remove('hidden');
    }
}

// Add item to cart function
function addToCart(id) {
    const item = menuItems.find(i => i.id === id);
    if (item) {
        if (!item.available || (item.stockQuantity !== undefined && item.stockQuantity <= 0)) {
            alert('This item is currently unavailable');
            return;
        }
        currentModalItem = item;
        currentModalCount = 1;
        document.getElementById('modalItemName').innerText = item.name;
        document.getElementById('modalCountValue').innerText = currentModalCount;
        document.getElementById('countModal').classList.remove('hidden');
    }
}

function toggleMobileMenu(event) {
    if (event) {
        event.stopPropagation();
    }

    const menu = document.getElementById('mobileMenu');
    const menuBtn = document.getElementById('mobileMenuBtn');

    menu.classList.toggle('closed');

    if (!menu.classList.contains('closed')) {
        menuBtn.innerHTML = '<i class="fas fa-times"></i>';
        setTimeout(() => {
            document.addEventListener('click', closeMenuOnOutsideClick);
        }, 10);
    } else {
        menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
        document.removeEventListener('click', closeMenuOnOutsideClick);
    }
}


function closeMenuOnOutsideClick(event) {
    const menu = document.getElementById('mobileMenu');
    const menuBtn = document.getElementById('mobileMenuBtn');
    
    if (!menu.contains(event.target) && !menuBtn.contains(event.target)) {
        menu.classList.add('closed');
        menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
        document.removeEventListener('click', closeMenuOnOutsideClick);
    }
}

function toggleDesktopMenu() {
    const menu = document.getElementById('desktopMenu');
    menu.classList.toggle('hidden');
}

// Close mobile menu when clicking anywhere on page
document.addEventListener('click', function(event) {
    const menu = document.getElementById('mobileMenu');
    const menuBtn = document.getElementById('mobileMenuBtn');
    
    if (menu && !menu.classList.contains('closed')) {
        if (!menu.contains(event.target) && !menuBtn.contains(event.target)) {
            menu.classList.add('closed');
            menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
        }
    }
});

function setRole(role) {
    const idInput = document.getElementById('userIdentifier');
    const userRole = document.getElementById('userRole');
    const roleStu = document.getElementById('roleStu');
    const roleAdm = document.getElementById('roleAdm');
    
    if(userRole) userRole.value = role;
    if(roleStu) roleStu.classList.toggle('active', role === 'student');
    if(roleAdm) roleAdm.classList.toggle('active', role === 'owner');
    if(idInput) idInput.placeholder = (role === 'student') ? "Roll Number" : "College Email";
}

// Developers Page Functions
function showDevelopers() {
    document.getElementById('landingPage').classList.add('hidden');
    document.getElementById('developersPage').classList.remove('hidden');
}

function hideDevelopers() {
    document.getElementById('developersPage').classList.add('hidden');
    document.getElementById('landingPage').classList.remove('hidden');
}

function goBackFromDevelopers() {
    hideDevelopers();
}

// User Login Functions
function showLogin(role) {
    if (role === 'student') {
        showUserLogin();
    } else if (role === 'admin') {
        showAdminLogin();
    } else {
        clearLoginForms();
    }
}

function showUserLogin() {
    clearLoginForms();
    document.getElementById('userLoginPage').classList.remove('hidden');
    document.getElementById('userLoginError').classList.add('hidden');
}

function hideUserLogin() {
    document.getElementById('userLoginPage').classList.add('hidden');
    document.getElementById('userLoginError').classList.add('hidden');
    clearLoginForms();
}


function showUserRegister() {
    hideUserLogin();
    document.getElementById('userRegisterPage').classList.remove('hidden');
}

function clearLoginForms() {
    ['userLoginName', 'userLoginPass', 'adminLoginIdentifier', 'adminLoginPass'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const userError = document.getElementById('userLoginError');
    const adminError = document.getElementById('adminLoginError');
    if (userError) userError.classList.add('hidden');
    if (adminError) adminError.classList.add('hidden');
}

// Admin Login Functions
function showAdminLogin() {
    clearLoginForms();
    document.getElementById('adminLoginPage').classList.remove('hidden');
    document.getElementById('adminLoginError').classList.add('hidden');
}

function hideAdminLogin() {
    document.getElementById('adminLoginPage').classList.add('hidden');
    document.getElementById('adminLoginError').classList.add('hidden');
    clearLoginForms();
}


// User Registration Form Handler
document.getElementById('userRegisterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('userRegName').value;
    const rollNo = document.getElementById('userRegIdentifier').value;
    const email = document.getElementById('userRegEmail').value;
    const password = document.getElementById('userRegPass').value;
    
    if (!name || !rollNo || !email || !password) {
        alert('Please fill all fields');
        return;
    }
    
    const newUser = { username: name, rollNo, email, password, role: 'STUDENT' };
    const result = await api.post('/users/register', newUser);
    
    if (!result) {
        console.log("Using local registration fallback");
        const newLocalUser = {
            id: registeredUsers.length > 0 ? Math.max(...registeredUsers.map(u => u.id || 0)) + 1 : 1,
            name: name,
            rollNo: rollNo,
            email: email,
            password: password
        };
        registeredUsers.push(newLocalUser);
        result = newLocalUser;
    }
    
    if (result && result.id) {
        alert('Registration successful! Please login.');
        hideUserRegister();
        renderSuperAdminData();
    } else {
        alert('Registration failed. Please try again.');
    }
});



// Admin Login Form Handler
document.getElementById('adminAuthForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Load canteens to map canteen names to ids
    await loadCanteens();
    
    const errorEl = document.getElementById('adminLoginError');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
    
    const identifier = document.getElementById('adminLoginIdentifier').value.trim();
    const password = document.getElementById('adminLoginPass').value.trim();
    
    if (!identifier || !password) {
        alert('Please enter both identifier and password');
        return;
    }
    
    if (identifier === 'legend' && password === 'legend123') {
        currentUser = 'Super Admin';
        persistSession();
        hideAdminLogin();
        navigateTo('superadmin');
        return;
    }
    
    let apiAdmin = null;
    try {
        apiAdmin = await api.post('/admins/login', { email: identifier, password });
    } catch (e) {}
    
    // Only treat API response as valid when it is NOT an error object and has an id
    const apiSuccess = apiAdmin && !apiAdmin.error && (apiAdmin.id || apiAdmin.email);
    const localMatch = registeredAdmins.find(a => a.email === identifier && a.password === password);
    const admin = localMatch || (apiSuccess ? apiAdmin : null);
    
    if (admin) {
        currentUser = admin.name;
        // Find the canteen id by name from the canteensList
        const canteen = canteensList.find(c => c.name === admin.canteen);
        if (canteen) {
            selectedRestaurantId = canteen.id;
        } else {
            selectedRestaurantId = null;
        }
        selectedRestaurantName = admin.canteen || '';
        await loadMenuItems();
        await loadCategories();
        await loadFeedback();
        persistSession();
        navigateTo('admin');
    } else {
        const identifierExists = registeredAdmins.some(a => a.email === identifier) || (apiAdmin && !apiAdmin.error);
        if (errorEl) {
            errorEl.textContent = identifierExists
                ? 'Incorrect password. Please try again.'
                : 'Invalid username or password';
            errorEl.classList.remove('hidden');
        } else {
            alert('Invalid admin credentials!\nSuper admin: legend / legend123');
        }
    }
});

// User Login Form Handler
document.getElementById('userAuthForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const errorEl = document.getElementById('userLoginError');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
    
    const name = document.getElementById('userLoginName').value.trim();
    const password = document.getElementById('userLoginPass').value.trim();
    
    if (!name || !password) {
        alert('Please enter both name and password');
        return;
    }
    
    let apiUser = null;
    try {
        apiUser = await api.post('/users/login', { username: name, password });
    } catch (e) {}
    
    // Only treat API response as valid when it is NOT an error object and has an id
    const apiSuccess = apiUser && !apiUser.error && apiUser.id;
    const localMatch = registeredUsers.find(u => u.name === name && u.password === password);
    const user = localMatch || (apiSuccess ? apiUser : null);
    
    if (user) {
        currentUser = user.name || user.username || '';
        currentUserId = user.id || user.userId || null;
        persistSession();
        navigateTo('restaurants');
    } else {
        const nameExists = registeredUsers.some(u => u.name === name) || (apiUser && !apiUser.error);
        if (errorEl) {
            errorEl.textContent = nameExists
                ? 'Incorrect password. Please try again.'
                : 'Invalid username or password';
            errorEl.classList.remove('hidden');
        } else {
            alert('Invalid credentials! Please check your name and password.\nDefault test user: name: Test User, password: test123');
        }
    }
});

// Super Admin Dashboard Functions
async function showSuperAdminDashboard() {
    document.getElementById('adminLoginPage').classList.add('hidden');
    document.getElementById('landingPage').classList.add('hidden');
    document.getElementById('superAdminDashboard').classList.remove('hidden');
    
    await Promise.all([
        loadCanteens(),
        loadAdmins(),
        loadUsers()
    ]);
    syncOrders().then(() => renderSuperAdminData());
}

function renderSuperAdminData() {
    // Render Users Table
    const usersTable = document.getElementById('usersTableBody');
    if (registeredUsers.length === 0) {
        usersTable.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-400">No users registered</td></tr>';
    } else {
        usersTable.innerHTML = registeredUsers.map((u, index) => `
            <tr class="border-b">
                <td class="p-3 text-black">${u.name}</td>
                <td class="p-3 text-black">${u.rollNo}</td>
                <td class="p-3 text-black">${u.email}</td>
                <td class="p-3 text-black">${u.password}</td>
                <td class="p-3">
                    <button onclick="deleteUser(${index})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }
    
    // Render Admins Table
    const adminsTable = document.getElementById('adminsTableBody');
    if (registeredAdmins.length === 0) {
        adminsTable.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-400">No admins registered</td></tr>';
    } else {
        adminsTable.innerHTML = registeredAdmins.map((a, index) => `
            <tr class="border-b">
                <td class="p-3 text-black">${a.name}</td>
                <td class="p-3 text-black">${a.email}</td>
                <td class="p-3 text-black">${a.canteen || 'Not Assigned'}</td>
                <td class="p-3 text-black">${a.password}</td>
                <td class="p-3">
                    <button onclick="showEditAdminModal(${index})" class="text-blue-500 hover:text-blue-700 mr-2"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteAdmin(${index})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }
    

      const canteensTable = document.getElementById('canteensTableBody');
      if (canteensList.length === 0) {
          canteensTable.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-400">No canteens</td></tr>';
      } else {
          canteensTable.innerHTML = canteensList.map((c, index) => {
              const admin = registeredAdmins.find(a => a.canteen === c.name);
              const adminName = admin ? admin.name : 'Not Assigned';
              const canteenOrders = orders.filter(o => o.restro === c.name);
              const revenue = canteenOrders.reduce((sum, o) => sum + o.total, 0);
              const statusBadge = c.isActive
                  ? '<span class="text-green-600 font-bold">Active</span>'
                  : '<span class="text-red-500 font-bold">Inactive</span>';
              return `
                  <tr class="border-b">
                      <td class="p-3 text-black">${c.name}</td>
                      <td class="p-3 text-black">${c.location}</td>
                      <td class="p-3">${statusBadge}</td>
                      <td class="p-3 text-black">${adminName}</td>
                      <td class="p-3 text-black">${canteenOrders.length}</td>
                      <td class="p-3 text-black">₹${revenue.toFixed(0)}</td>
                      <td class="p-3">
                          <button onclick="showEditCanteenModal(${index})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit Canteen"><i class="fas fa-edit"></i></button>
                          <button onclick="deleteCanteen(${index})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
                      </td>
                  </tr>
              `;
          }).join('');
      }
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').innerText = isRegisterMode ? "Create Account" : "Enter Restora";
    document.getElementById('authBtn').innerText = isRegisterMode ? "Register" : "Login";
    document.getElementById('authToggleText').innerText = isRegisterMode ? "Already have an account?" : "Don't have an account?";
    document.getElementById('authToggleBtn').innerText = isRegisterMode ? "Login" : "Register";
    document.getElementById('registerFields').classList.toggle('hidden', !isRegisterMode);
}

// Old login form - keep for compatibility but redirect to new functions
const authForm = document.getElementById('authForm');
if(authForm) {
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const role = document.getElementById('userRole')?.value;
        const typedName = document.getElementById('userName')?.value;
        const typedId = document.getElementById('userIdentifier')?.value;
        currentUser = typedName || (typedId ? typedId.split('@')[0] : '');
        
        const landingPage = document.getElementById('landingPage');
        const loginPage = document.getElementById('loginPage');
        if(landingPage) landingPage.classList.add('hidden');
        if(loginPage) loginPage.classList.add('hidden');
        
        if(role === 'owner') {
            const ownerDashboard = document.getElementById('ownerDashboard');
            const displayAdminName = document.getElementById('displayAdminName');
            if(ownerDashboard) ownerDashboard.classList.remove('hidden');
            if(displayAdminName) displayAdminName.innerText = currentUser;
            updateAdminUI();
        } else {
            const restaurantSelectPage = document.getElementById('restaurantSelectPage');
            if(restaurantSelectPage) restaurantSelectPage.classList.remove('hidden');
        }
    });
}

function selectRestaurant(name) {
    selectedRestaurantName = name;
    const canteen = canteensList.find(c => c.name === name);
    if (canteen) {
        selectedRestaurantId = canteen.id;
    } else {
        selectedRestaurantId = null;
    }
    document.getElementById('restaurantSelectPage').classList.add('hidden');
    persistSession();
    navigateTo('menu');
    updateCategoryFilterButtons();
    loadMenuItems().then(async () => {
        await loadCategories();
        await loadFeedback();
        updateCategoryFilterButtons();
        renderMenu();
        updateStudentOrders();
        updateCartOrdersPage();
        syncOrders().then(() => {
            updateStudentOrders();
            updateCartOrdersPage();
        });
    });
}

function backToRestroSelect() {
    renderRestaurantSelection();
    persistSession();
    navigateTo('restaurants');
}

function renderRestaurantSelection() {
    const container = document.getElementById('restaurantCardsContainer');
    if (!container) return;

    const activeCanteens = canteensList.filter(c => c.isActive);

    const canteenColors = [
        { bg: 'bg-orange-100', text: 'text-orange-600', icon: 'fa-utensils' },
        { bg: 'bg-blue-100', text: 'text-blue-600', icon: 'fa-store' },
        { bg: 'bg-red-100', text: 'text-red-600', icon: 'fa-drumstick-bite' },
        { bg: 'bg-green-100', text: 'text-green-600', icon: 'fa-leaf' },
        { bg: 'bg-purple-100', text: 'text-purple-600', icon: 'fa-bowl-rice' },
        { bg: 'bg-yellow-100', text: 'text-yellow-600', icon: 'fa-mug-hot' }
    ];

    if (activeCanteens.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">No canteens are currently active. Please check back later.</p>';
        return;
    }

    container.innerHTML = activeCanteens.map((c, index) => {
        const color = canteenColors[index % canteenColors.length];
        return `
            <div onclick="selectRestaurant('${c.name.replace(/'/g, "\\'")}')" class="restro-card bg-white p-6 rounded-3xl shadow-sm border cursor-pointer transition">
                <div class="w-16 h-16 ${color.bg} ${color.text} rounded-2xl flex items-center justify-center text-3xl mb-4"><i class="fas ${color.icon}"></i></div>
                <h3 class="font-bold text-xl text-black">${c.name}</h3>
                <p class="text-sm text-gray-500">${c.location || 'Canteen'}</p>
            </div>
        `;
    }).join('');
}


function hideLogin() { 
    const loginPage = document.getElementById('loginPage');
    if(loginPage) loginPage.classList.add('hidden'); 
    isRegisterMode = false;
}

function logout() { 
    clearLoginForms();
    stopIdleTimer();
    try {
        localStorage.removeItem('sessionUser');
        localStorage.removeItem('sessionUserId');
        localStorage.removeItem('sessionRestroName');
        localStorage.removeItem('sessionRestroId');
        localStorage.removeItem('currentView');
        localStorage.removeItem('cart');
        localStorage.removeItem('orders');
        sessionStorage.clear();
    } catch(e) {}
    cart = [];
    currentUser = "";
    currentUserId = null;
    selectedRestaurantName = "";
    selectedRestaurantId = null;
    // If we are on a separate sub-page, return to the landing page.
    const path = window.location.pathname;
    if (!path.endsWith('index.html') && !path.endsWith('/')) {
        window.location.href = 'index.html';
        return;
    }
    const _ls = document.getElementById('landingPage');
    const _ul = document.getElementById('userLoginPage');
    const _al = document.getElementById('adminLoginPage');
    const _rs = document.getElementById('restaurantSelectPage');
    const _sd = document.getElementById('studentDashboard');
    const _od = document.getElementById('ownerDashboard');
    const _sa = document.getElementById('superAdminDashboard');
    const _dv = document.getElementById('developersPage');
    if (_ls) _ls.classList.remove('hidden');
    if (_ul) _ul.classList.add('hidden');
    if (_al) _al.classList.add('hidden');
    if (_rs) _rs.classList.add('hidden');
    if (_sd) _sd.classList.add('hidden');
    if (_od) _od.classList.add('hidden');
    if (_sa) _sa.classList.add('hidden');
    if (_dv) _dv.classList.add('hidden');
}

function clearSystemData() {
    if(confirm("Are you sure you want to clear local data?")) {
        location.reload();
    }
}

async function saveData() {
    try {
        await syncOrders();
    } catch (e) {
        console.error("Save data failed:", e);
    }
}

// Clear orders for specific canteen
async function clearCanteenOrders() {
    const assignedCanteen = selectedRestaurantName;
    if (!assignedCanteen) {
        alert('No canteen selected');
        return;
    }
    
    if (!confirm(`Are you sure you want to clear all orders for ${assignedCanteen}?`)) {
        return;
    }
    
    try {
        // First, sync to get latest orders from server
        await syncOrders();
        
        // Get orders for this canteen that need to be deleted
        const ordersToDelete = orders.filter(o => o.restro === assignedCanteen);
        
        // Delete each order from the server
        for (const order of ordersToDelete) {
            await api.delete(`/orders/${order.id}`);
        }
        
        // Sync again to get updated order list
        await syncOrders();
        
        updateAdminUI();
        alert(`All orders for ${assignedCanteen} have been cleared.`);
    } catch (e) {
        console.error("Error clearing canteen orders:", e);
        alert('Failed to clear orders. Please try again.');
    }
}

function renderMenu(filter = 'All') {
    const container = document.getElementById('menuContainer');
    let items = filter === 'All' ? menuItems : menuItems.filter(i => i.cat === filter);
    
    // Sort items based on current session
    const session = getCurrentSession(canteensList.find(c => c.id === selectedRestaurantId));
    if (session === 'LUNCH') {
        // Lunch items first, then BOTH, then Evening items last
        items = [...items].sort((a, b) => {
            const order = { 'LUNCH': 0, 'BOTH': 1, 'EVENING': 2 };
            return (order[a.slot] || 1) - (order[b.slot] || 1);
        });
    } else if (session === 'EVENING') {
        // Evening items first, then BOTH, then Lunch items last
        items = [...items].sort((a, b) => {
            const order = { 'EVENING': 0, 'BOTH': 1, 'LUNCH': 2 };
            return (order[a.slot] || 1) - (order[b.slot] || 1);
        });
    }
    
    container.innerHTML = items.map(i => {
        const isAvailable = i.available && (i.stockQuantity > 0);
        const statusColor = isAvailable ? 'text-green-600' : 'text-red-600';
        const statusText = isAvailable ? 'Available' : 'Unavailable';
        const btnClass = isAvailable ? 'bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed';
        const btnAction = isAvailable ? `onclick="openCountModal(${i.id})"` : '';
        
        // Slot badge
        let slotBadge = '';
        if (i.slot === 'LUNCH') {
            slotBadge = '<span class="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">🌤 Lunch</span>';
        } else if (i.slot === 'EVENING') {
            slotBadge = '<span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">🌙 Evening</span>';
        }
        
        return `
        <div class="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center hover:shadow-md transition ${isAvailable ? '' : 'opacity-75'}">
            <div class="flex items-center gap-3">
                 ${itemIconHTML(i)}
                 <div>
                    <h4 class="font-bold text-sm text-gray-800">${i.name}</h4>
                    <p class="text-orange-600 font-bold text-xs">₹${i.price}</p>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold ${statusColor}"><i class="fas fa-circle text-[8px] mr-1"></i>${statusText}</span>
                        ${slotBadge}
                    </div>
                    ${ratingBadgeHTML(i.id)}
                </div>
            </div>
            <button ${btnAction} class="${btnClass} p-2 rounded-lg transition" ${isAvailable ? '' : 'disabled'}>
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `;
    }).join('');
}

// Update category filter buttons dynamically
function updateCategoryFilterButtons() {
    const container = document.querySelector('#studentDashboard .flex.flex-wrap.gap-2.mb-4');
    if (!container) return;
    
    container.innerHTML = `
        <button onclick="filterMenu('All')" class="category-filter-btn bg-orange-600 text-white px-3 md:px-4 py-1 rounded-full text-xs md:text-sm whitespace-nowrap">All</button>
        ${categories.map(cat => `
            <button onclick="filterMenu('${cat}')" class="category-filter-btn bg-white border px-3 md:px-4 py-1 rounded-full text-xs md:text-sm whitespace-nowrap text-black">${cat}</button>
        `).join('')}
    `;
}

function filterMenu(cat) { 
    const buttons = document.querySelectorAll('.category-filter-btn');
    buttons.forEach(btn => {
        if(btn.innerText === cat) {
            btn.classList.add('bg-orange-600', 'text-white');
            btn.classList.remove('bg-white', 'text-black');
        } else {
            btn.classList.remove('bg-orange-600', 'text-white');
            btn.classList.add('bg-white', 'text-black');
        }
    });
    renderMenu(cat); 
}

function openCountModal(id) {
    currentModalItem = menuItems.find(i => i.id === id);
    if (!currentModalItem) return;
    
    if (!currentModalItem.available || (currentModalItem.stockQuantity !== undefined && currentModalItem.stockQuantity <= 0)) {
        alert('This item is currently unavailable');
        return;
    }
    
    currentModalCount = 1;
    document.getElementById('modalItemName').innerText = currentModalItem.name;
    document.getElementById('modalCountValue').innerText = currentModalCount;
    document.getElementById('countModal').classList.remove('hidden');
}

function changeModalCount(val) {
    currentModalCount = Math.max(1, currentModalCount + val);
    document.getElementById('modalCountValue').innerText = currentModalCount;
}

function closeCountModal() {
    document.getElementById('countModal').classList.add('hidden');
    currentModalItem = null;
    currentModalCount = 1;
}

function confirmAddToCart() {
    if (currentModalItem) {
        if (!currentModalItem.available || (currentModalItem.stockQuantity !== undefined && currentModalItem.stockQuantity <= 0)) {
            alert('This item is currently unavailable');
            closeCountModal();
            return;
        }
        const cartItem = { 
            ...currentModalItem, 
            quantity: currentModalCount
        };
        cart.push(cartItem);
        closeCountModal();
        updateCartUI();
        persistSession();
        navigateTo('cart');
    }
}

function updateCartUI() {
    const container = document.getElementById('cartItemsPage');
    const summary = document.getElementById('cartSummaryPage');
    const containerMobile = document.getElementById('cartItemsMobile');
    const summaryMobile = document.getElementById('cartSummaryMobile');
    const cartCountMobile = document.getElementById('cartCountMobile');
    const cartCountBtn = document.getElementById('cartCountBtn');
    
    const grouped = cart.reduce((acc, item) => {
        acc[item.name] = (acc[item.name] || 0) + 1;
        return acc;
    }, {});

    if(!cart.length) {
        if(container) container.innerHTML = `<p class="text-center text-gray-400 py-4 text-xs">Your cart is empty</p>`;
        if(summary) summary.classList.add('hidden');
        if(containerMobile) containerMobile.innerHTML = `<p class="text-center text-gray-400 py-2 text-xs">Your cart is empty</p>`;
        if(summaryMobile) summaryMobile.classList.add('hidden');
        if(cartCountMobile) cartCountMobile.classList.add('hidden');
        if(cartCountBtn) cartCountBtn.classList.add('hidden');
        return;
    }
    
    if(summary) summary.classList.remove('hidden');
    if(summaryMobile) summaryMobile.classList.remove('hidden');
    if(cartCountMobile) {
        cartCountMobile.classList.remove('hidden');
        cartCountMobile.innerText = cart.reduce((sum, item) => sum + item.quantity, 0);
    }
    if(cartCountBtn) {
        cartCountBtn.classList.remove('hidden');
        cartCountBtn.innerText = cart.reduce((sum, item) => sum + item.quantity, 0);
    }
    
    const cartHTML = Object.keys(grouped).map(name => {
        const itemData = menuItems.find(mi => mi.name === name);
        const count = grouped[name];
        return `
            <div class="flex justify-between text-xs items-center bg-gray-50 p-2 rounded-lg text-black">
                <span class="text-gray-700">${count}x ${name}</span>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-500">₹${itemData.price * count}</span>
                    <button onclick="removeItem('${name}')" class="text-red-500 hover:text-red-700 font-bold"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;
    }).join('');
    
    if(container) container.innerHTML = cartHTML;
    if(containerMobile) containerMobile.innerHTML = cartHTML;
    
    const total = cart.reduce((s, i) => s + i.price, 0);
    if(document.getElementById('cartTotalPage')) document.getElementById('cartTotalPage').innerText = total;
    if(document.getElementById('cartTotalMobile')) document.getElementById('cartTotalMobile').innerText = total;
    
    // Update cart on the new cart/orders page
    updateCartOrdersPage();
    saveCartOrders();
}

function processPayment() {

    if (cart.length === 0) {
        alert("Cart is empty!");
        return;
    }

    const total = cart.reduce((sum, item) => sum + item.price, 0);

    document.getElementById("upiAmount").innerText = total;
    document.getElementById("upiModal").classList.remove("hidden");

    document.getElementById("qrContainer").innerHTML = "";

    new QRCode(document.getElementById("qrContainer"), {
        text: "upi://pay?pa=restora@upi&pn=Restora&am=" + total,
        width: 150,
        height: 150
    });
}
async function confirmUPIPayment() {
    if (cart.length === 0) {
        alert("Cart is empty!");
        return;
    }

    const upiId = document.getElementById("upiIdInput").value;

    if (!upiId || !upiId.includes("@")) {
        alert("Enter valid UPI ID");
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const btn = document.getElementById("upiPayBtn");

    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const fakeTxnId = "TXN" + Math.floor(Math.random() * 1000000000);
        const orderNum = "ORD" + Date.now() + Math.floor(Math.random() * 1000);

        const session = getCurrentSession(canteensList.find(c => c.id === selectedRestaurantId));

        const orderData = {
            user: { id: currentUserId || 2 },
            canteen: selectedRestaurantId ? { id: selectedRestaurantId } : null,
            items: cart.map(item => ({ menuItem: { id: item.id }, quantity: item.quantity, unitPrice: item.price })),
            totalAmount: total,
            paymentMethod: "UPI",
            paymentStatus: "COMPLETED",
            orderNumber: orderNum,
            transactionId: fakeTxnId,
            status: "PENDING",
            restaurantName: selectedRestaurantName,
            session: session,
            uniqueId: orderNum
        };

        const result = await api.post('/orders', orderData);
        if (!result || result.error) {
            const msg = (result && result.message) ? result.message : "Server error. Please check your connection and try again.";
            alert("Payment failed: " + msg + " Please do not pay again. Check your orders before retrying.");
            throw new Error("Order creation failed: " + msg);
        }

        const newOrderId = result.id;
        window._lastOrderIdForFeedback = newOrderId;
        orders.push({
            id: newOrderId,
            user: currentUser,
            restro: selectedRestaurantName,
            items: cart.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                img: item.img,
                imageUrl: item.imageUrl
            })),
            total: total,
            time: new Date().toISOString(),
            transactionId: result.uniqueId || orderNum,
            status: "PENDING"
        });

        cart = [];
        updateCartUI();
        await syncOrders();
        updateStudentOrders();
        updateCartOrdersPage();

        document.getElementById("upiModal").classList.add("hidden");

        const successScreen = document.getElementById("successScreen");
        successScreen.classList.remove("hidden");

        document.getElementById("txnText").innerText = fakeTxnId;
        document.getElementById("successAmount").innerText = "₹" + total;

        playSuccessSound();
        triggerSuccessHaptic();
    } catch (e) {
        console.error("Payment flow error:", e);
        alert("Payment failed. Please try again.");
    } finally {
        btn.innerText = "Pay Now";
        btn.disabled = false;
    }
}

function closeUPIModal(){
    document.getElementById("upiModal").classList.add("hidden");
}

function closeSuccessScreen(){
    document.getElementById("successScreen").classList.add("hidden");
    
}

function playSuccessSound(){
    const audio = new Audio("success.mp3");
    audio.play().catch(error => {
        console.log("Audio blocked:", error);
    });
}

async function syncOrders() {
    const previousOrdersCount = orders.length;
    try {
        const data = await api.get('/orders');
        if (data && Array.isArray(data)) {
            const serverOrders = data.map(o => {
                let userName = 'Guest';
                if (o.user && typeof o.user === 'object') {
                    userName = o.user.username || o.user.name || o.user.full_name || o.user.fullName || 'Guest';
                }
                return {
                    id: o.id,
                    user: userName,
                    restro: o.restaurantName || o.restaurant_name || (o.canteen ? o.canteen.name : null) || 'Main Canteen',
                    items: (o.items || o.orderItems || o.order_items || []).map(i => {
                        const mi = i.menuItem || i.menu_item || {};
                         return {
                            name: mi.name || 'Unknown Item',
                            price: i.unitPrice || i.unit_price || i.price || 0,
                            quantity: i.quantity || 1,
                            img: mi.emoji || '🍽️',
                            imageUrl: mi.imageUrl || mi.image_url || null
                        };
                    }),
                    total: o.totalAmount || o.total_amount || 0,
                    time: o.orderTime || o.order_time,
                    completedTime: o.completedTime || o.completed_time,
                    transactionId: o.uniqueId || o.unique_id || o.transactionId || o.transaction_id,
                    status: (o.status || o.orderStatus || o.order_status || 'PENDING').toUpperCase()
                };
            });
            // Merge server orders with local orders, preserving completed status and user
            const orderMap = new Map();
            orders.forEach(o => orderMap.set(o.id, { ...o }));
            serverOrders.forEach(so => {
                if (orderMap.has(so.id)) {
                    const localOrder = orderMap.get(so.id);
                    if (recentlyCompletedOrders.has(so.id) && (localOrder.status === 'COMPLETED' || localOrder.completedTime)) {
                        so.status = 'COMPLETED';
                    }
                    // Prefer local user value to preserve correct username
                    if (localOrder.user && localOrder.user !== 'Guest') {
                        so.user = localOrder.user;
                    }
                    so.restro = localOrder.restro || so.restro;
                    if (!so.items || so.items.length === 0) {
                        so.items = localOrder.items;
                    }
                }
                orderMap.set(so.id, so);
            });
            orders = Array.from(orderMap.values());
            console.log("Synced orders:", orders.length);
        } else {
            // Keep existing local orders if server returns null/empty
            console.log("No data from server, preserving local orders:", orders.length);
        }
    } catch (e) {
        console.error("Order Sync Failed - keeping local orders:", e);
        // Keep existing local orders on error
    }
    saveCartOrders();
    // Only update UI if we have orders or there were previous orders
    if (orders.length > 0 || previousOrdersCount > 0) {
        updateStudentOrders();
        updateOrderHistoryPage();
    }
}

function updateStudentOrders() {
    const container = document.getElementById('myOrdersListPage');
    const myOrders = orders.filter(o => o.user === currentUser);
    if(!container) return;
    if(!myOrders.length) {
        container.innerHTML = `<p class="text-xs text-gray-400">No active orders</p>`;
    } else {
        container.innerHTML = myOrders.map(o => {
            // Group items by name and count quantities
            const itemCounts = {};
            o.items.forEach(item => {
                itemCounts[item.name] = (itemCounts[item.name] || 0) + 1;
            });
            const itemDisplay = Object.entries(itemCounts).map(([name, count]) => 
                `<div class="text-[10px] text-gray-400">${name} (${count})</div>`
            ).join('');
            
            return `
            <div class="bg-white p-3 rounded-xl border border-orange-100 shadow-sm text-black">
                <div class="flex justify-between font-bold text-xs"><span>Order #${o.id}</span><span class="text-orange-600">₹${o.total}</span></div>
                <p class="text-[9px] text-orange-500 font-bold uppercase mb-1">${o.restro}</p>
                <div class="space-y-0.5">${itemDisplay}</div>
                <div class="mt-2 text-[9px] font-bold uppercase tracking-widest ${
                  o.status === "COMPLETED" ? "text-green-600" : "text-orange-600"
}">
    ${o.status}
</div>
            </div>
        `}).join('');
    }
    
    // Also update orders on the new cart/orders page
    updateStudentOrdersPage();
}
function fadeOutSuccessScreen() {
    if (window.successNavigated) return;
    window.successNavigated = false;
    const screen = document.getElementById("successScreen");

    screen.style.opacity = "0";

    setTimeout(() => {
        screen.classList.add("hidden");
        screen.style.opacity = "1";
    }, 500);
}
function goToHome() {
    window.successNavigated = true;
    const success = document.getElementById("successScreen");
    if (success) success.classList.add("hidden");
    persistSession();
    navigateTo('cart');
}

function goToCheckout() {
    if (cart.length === 0) {
        alert("Cart is empty!");
        return;
    }
    if (!isOrderingAllowed()) {
        const label = getCurrentSessionLabel();
        alert(`Ordering is currently not allowed.\n${label}\n\nYou can still browse the menu and add items to cart.`);
        return;
    }
    persistSession();
    navigateTo('checkout');
}

// Checkout Page Functions
function openCheckoutPage() {
    if (cart.length === 0) return;
    // Update checkout page with cart items
    const checkoutItems = document.getElementById('checkoutItems');
    const checkoutTotal = document.getElementById('checkoutTotal');
    const checkoutAmount = document.getElementById('checkoutAmount');
    if (!checkoutItems || !checkoutTotal || !checkoutAmount) return;
    
    let total = 0;
    checkoutItems.innerHTML = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div class="flex items-center gap-3">
                    ${itemIconHTML(item, true)}
                    <div>
                        <p class="font-bold text-sm text-gray-800">${item.name} (x${item.quantity})</p>
                        <p class="text-orange-600 text-xs font-bold">₹${itemTotal}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    checkoutTotal.innerText = total;
    checkoutAmount.innerText = total;
}

function closeCheckoutPage() {
    persistSession();
    navigateTo('cart');
}

async function processCheckoutPayment() {
    if (cart.length === 0) {
        alert("Cart is empty!");
        return;
    }

    const upiId = document.getElementById('checkoutUpiId').value;

    if (!upiId || !upiId.includes("@")) {
        alert("Enter valid UPI ID");
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const btn = document.querySelector('#checkoutPage button[onclick="processCheckoutPayment()"]');

    if(btn) {
        btn.innerText = "Processing...";
        btn.disabled = true;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const fakeTxnId = "TXN" + Math.floor(Math.random() * 1000000000);
        const orderNum = "ORD" + Date.now() + Math.floor(Math.random() * 1000);

        const session = getCurrentSession(canteensList.find(c => c.id === selectedRestaurantId));

        const orderData = {
            user: { id: currentUserId || 2 },
            canteen: selectedRestaurantId ? { id: selectedRestaurantId } : null,
            items: cart.map(item => ({ menuItem: { id: item.id }, quantity: item.quantity, unitPrice: item.price })),
            totalAmount: total,
            paymentMethod: "UPI",
            paymentStatus: "COMPLETED",
            orderNumber: orderNum,
            transactionId: fakeTxnId,
            status: "PENDING",
            restaurantName: selectedRestaurantName,
            session: session,
            uniqueId: orderNum
        };

        const result = await api.post('/orders', orderData, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!result || result.error) {
            const msg = (result && result.message) ? result.message : "Server error. Please check your connection and try again.";
            alert("Payment failed: " + msg + " Please do not pay again. Check your orders before retrying.");
            throw new Error("Order creation failed: " + msg);
        }

        const newOrderId2 = result.id;
        window._lastOrderIdForFeedback = newOrderId2;
        orders.push({
            id: newOrderId2,
            user: currentUser,
            restro: selectedRestaurantName,
            items: cart.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                img: item.img,
                imageUrl: item.imageUrl
            })),
            total: total,
            time: new Date().toISOString(),
            transactionId: result.uniqueId || orderNum,
            status: "PENDING"
        });

        cart = [];
        updateCartUI();
        await syncOrders();
        updateStudentOrders();
        updateCartOrdersPage();

        document.getElementById('checkoutPage').classList.add('hidden');
        const successScreen = document.getElementById("successScreen");
        successScreen.classList.remove("hidden");

        document.getElementById("txnText").innerText = fakeTxnId;
        document.getElementById("successAmount").innerText = "₹" + total;

        playSuccessSound();
        triggerSuccessHaptic();
    } catch (e) {
        console.error("Checkout payment error:", e);
        alert("Payment failed. Please try again.");
    } finally {
        if(btn) {
            btn.innerText = "Pay Now";
            btn.disabled = false;
        }
    }
}

// Order History Page Functions
function openOrderHistoryPage() {
    persistSession();
    navigateTo('history');
}

function updateOrderHistoryPage() {
    const myOrders = orders.filter(o => o.user === currentUser);
    const orderHistoryList = document.getElementById('orderHistoryList');
    
    if(!orderHistoryList) return;
    
    if (!myOrders.length) {
        orderHistoryList.innerHTML = `<div class="text-center text-gray-500 py-20">
            <p class="text-lg">No orders yet</p>
            <p class="text-sm mt-2">Your order history will appear here</p>
        </div>`;
    } else {
        orderHistoryList.innerHTML = myOrders.map(o => {
            // Group items by name and count quantities
            const itemCounts = {};
            o.items.forEach(item => {
                itemCounts[item.name] = (itemCounts[item.name] || 0) + 1;
            });
            const itemDisplay = Object.entries(itemCounts).map(([name, count]) => 
                `<div class="flex justify-between text-sm"><span>${name} (${count})</span><span>₹${o.items.find(i => i.name === name).price * count}</span></div>`
            ).join('');
            
            return `
            <div class="bg-white p-4 rounded-2xl shadow-sm border text-black">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-bold text-lg">Order #${o.id}</h3>
                        <p class="text-xs text-gray-500">${new Date(o.time).toLocaleString()}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${o.status === 'COMPLETED' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}">${o.status}</span>
                </div>
                <p class="text-sm text-orange-500 font-bold mb-2">${o.restro}</p>
                <div class="space-y-2 mb-3">
                    ${itemDisplay}
                </div>
                <div class="border-t pt-3 flex justify-between font-bold">
                    <span>Total</span>
                    <span class="text-orange-600">₹${o.total}</span>
                </div>
                <p class="text-xs text-gray-400 mt-2">Transaction ID: ${o.transactionId}</p>
                ${o.status === 'COMPLETED' ? `
                <div class="mt-3 pt-3 border-t border-dashed">
                    <button onclick="showOrderFeedbackModal(${o.id})" class="w-full bg-yellow-50 hover:bg-yellow-100 text-yellow-700 py-2 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2">
                        <i class="fas fa-star text-yellow-500"></i> Rate This Order
                    </button>
                </div>` : ''}
            </div>
        `}).join('');
    }
}

function closeOrderHistoryPage() {
    persistSession();
    navigateTo('cart');
}

// Remove item from cart function
function removeItem(itemName) {
    const index = cart.findIndex(item => item.name === itemName);
    if (index > -1) {
        cart.splice(index, 1);
        updateCartUI();
        updateCartOrdersPage();
    }
}

// Remove from cart function using index
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI(); // Re-renders the list immediately
    updateCartOrdersPage(); // Update cart orders page
}

// Cart & Orders Page Functions
async function openCartOrdersPage() {
    // Sync orders before showing cart page
    await syncOrders();
    await syncOrders();
    await loadFeedback();
    persistSession();
    navigateTo('cart');
}

function openCartOrdersPageAsync() {
    openCartOrdersPage().catch(e => console.error("Failed to load orders:", e));
}

function closeCartOrdersPage() {
    persistSession();
    navigateTo('menu');
}

function updateCartOrdersPage() {
    const container = document.getElementById('cartItemsPage');
    const totalDisplay = document.getElementById('cartTotalPage');
    const summary = document.getElementById('cartSummaryPage');

    if (cart.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400">Your cart is empty</div>`;
        summary.classList.add('hidden');
        totalDisplay.innerText = "0";
        return;
    }

    summary.classList.remove('hidden');
    let total = 0;

    container.innerHTML = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div class="flex items-center gap-3">
                    ${itemIconHTML(item, true)}
                    <div>
                        <p class="font-bold text-sm text-gray-800">${item.name} (x${item.quantity})</p>
                        <p class="text-orange-600 text-xs font-bold">₹${itemTotal}</p>
                    </div>
                </div>
                <button onclick="removeFromCart(${index})" class="text-red-400 hover:text-red-600 transition">
                    <i class="fas fa-times-circle text-lg"></i>
                </button>
            </div>
        `;
    }).join('');

    totalDisplay.innerText = total;
    
    // Update active orders on the page
    updateStudentOrdersPage();
}

function updateStudentOrdersPage() {
    const container = document.getElementById('myOrdersListPage');
    const myOrders = orders.filter(o => o.user === currentUser);
    if(!container) return;
    if(!myOrders.length) {
        container.innerHTML = `<p class="text-xs text-gray-400">No active orders</p>`;
        return;
    }
    container.innerHTML = myOrders.map(o => {
        // Group items by name and count quantities
        const itemCounts = {};
        o.items.forEach(item => {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
        });
        const itemDisplay = Object.entries(itemCounts).map(([name, count]) => 
            `<div class="text-[10px] text-gray-400">${name} (${count})</div>`
        ).join('');
        
        return `
        <div class="bg-white p-3 rounded-xl border border-orange-100 shadow-sm text-black">
            <div class="flex justify-between font-bold text-xs"><span>Order #${o.id}</span><span class="text-orange-600">₹${o.total}</span></div>
            <p class="text-[9px] text-orange-500 font-bold uppercase mb-1">${o.restro}</p>
            <div class="space-y-0.5">${itemDisplay}</div>
            <div class="mt-2 flex justify-between items-center">
                <span class="text-[9px] font-bold uppercase tracking-widest ${
                  o.status === "COMPLETED" ? "text-green-600" : "text-orange-600"
                }">${o.status}</span>
                ${o.status === "COMPLETED" ? `<button onclick="showOrderFeedbackModal(${o.id})" class="text-[9px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold hover:bg-yellow-200 transition"><i class="fas fa-star mr-1"></i>Rate</button>` : ''}
            </div>
        </div>
`}).join('');
}

function triggerSuccessHaptic() {

    if (!navigator.vibrate) return;

    // Premium success vibration pattern
    navigator.vibrate([
        80, 40,   // small tick
        120, 40,  // medium
        200       // strong finish
    ]);
}

async function updateAdminUI() {
    const queue = document.getElementById('adminOrderQueue');
    const completedQueue = document.getElementById('completedOrdersQueue');
    const assignedCanteen = selectedRestaurantName;
    
    const canteenNameEl = document.getElementById('adminCanteenName');
    if (canteenNameEl) {
        canteenNameEl.innerText = assignedCanteen ? assignedCanteen : 'All Canteens';
    }
    
    // Filter orders based on assigned canteen
    const filteredOrders = assignedCanteen ? orders.filter(o => o.restro === assignedCanteen) : orders;
    
    // Calculate stats for assigned canteen
    const pendingOrders = filteredOrders.filter(o => o.status !== 'COMPLETED');
    const completedOrders = filteredOrders.filter(o => o.status === 'COMPLETED');
    
    // Calculate profit only from completed orders
    const canteenProfit = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const pendingRevenue = pendingOrders.reduce((sum, o) => sum + o.total, 0);
    const completedRevenue = canteenProfit;
    
    document.getElementById('adminProfit').innerText = canteenProfit.toFixed(2);
    document.getElementById('totalOrdersStat').innerText = filteredOrders.length;
    document.getElementById('pendingStat').innerText = pendingOrders.length;
    document.getElementById('completedStat').innerText = completedOrders.length;
    document.getElementById('pendingRevenue').innerText = '₹' + pendingRevenue.toFixed(2);
    document.getElementById('completedRevenue').innerText = '₹' + completedRevenue.toFixed(2);
    
    // Render menu items list
    renderMenuItemsList();
    
    // Render category list
    renderCategoryList();

    // Render feedback & ratings
    renderOwnerFeedback();
    
    // Render pending orders
    queue.innerHTML = pendingOrders.map(o => {
        // Group items by name and count quantities
        const itemCounts = {};
        o.items.forEach(item => {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
        });
        const itemDisplay = Object.entries(itemCounts).map(([name, count]) => 
            `<div class="text-xs text-slate-300">${name} x ${count}</div>`
        ).join('');
        
        return `
        <div class="card-dark p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <div class="flex items-center gap-2">
                    <h4 class="font-bold text-orange-400">#${o.id}</h4>
                    <span class="text-[10px] text-slate-400 uppercase">by ${o.user} @ ${o.restro}</span>
                </div>
                <div class="mt-1 space-y-0.5">${itemDisplay}</div>
            </div>
            <div class="text-left sm:text-right w-full sm:w-auto border-t sm:border-0 pt-2 sm:pt-0">
                <p class="text-green-400 font-bold">₹${o.total}</p>
                <button onclick="completeOrder(${o.id})" class="w-full sm:w-auto bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded-lg text-[10px] font-bold mt-2 transition">COMPLETE</button>
            </div>
        </div>
    `}).join('');
    if(!pendingOrders.length) queue.innerHTML = `<div class="text-center text-slate-500 py-20 border-2 border-dashed border-slate-800 rounded-3xl">
        <p class="text-sm">No active orders</p>
        <p class="text-xs text-slate-600 mt-2">Orders will appear here when customers place them</p>
    </div>`;
    
    // Render completed orders
    completedQueue.innerHTML = completedOrders.map(o => {
        // Group items by name and count quantities
        const itemCounts = {};
        o.items.forEach(item => {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
        });
        const itemDisplay = Object.entries(itemCounts).map(([name, count]) => 
            `<div class="text-xs text-slate-300">${name} x ${count}</div>`
        ).join('');
        
        return `
        <div class="card-dark p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 opacity-75">
            <div>
                <div class="flex items-center gap-2">
                    <h4 class="font-bold text-green-400">#${o.id}</h4>
                    <span class="text-[10px] text-slate-400 uppercase">by ${o.user} @ ${o.restro}</span>
                    <span class="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full">COMPLETED</span>
                </div>
                <div class="mt-1 space-y-0.5">${itemDisplay}</div>
            </div>
            <div class="text-left sm:text-right w-full sm:w-auto border-t sm:border-0 pt-2 sm:pt-0">
                <p class="text-green-400 font-bold">₹${o.total}</p>
            </div>
        </div>
    `}).join('');
    if(!completedOrders.length) completedQueue.innerHTML = `<div class="text-center text-slate-500 py-20 border-2 border-dashed border-slate-800 rounded-3xl">
        <p class="text-sm">No completed orders</p>
        <p class="text-xs text-slate-600 mt-2">COMPLETED orders will appear here</p>
    </div>`;
}

async function completeOrder(id) {
    const assignedCanteen = selectedRestaurantName;
    const order = orders.find(o => o.id === id);
    
    if (!order) {
        alert('Order not found');
        return;
    }
    
    if (assignedCanteen && order.restro !== assignedCanteen) {
        alert('This order is from a different canteen');
        return;
    }

    // Mark as recently completed to prevent sync from overwriting
    recentlyCompletedOrders.add(id);
    
    try {
        let statusRes = await api.patch(`/orders/${id}/status?status=COMPLETED`);
        let payRes = await api.patch(`/orders/${id}/payment?paymentStatus=PAID`);
        console.log('Complete order response:', statusRes, payRes);
        order.status = 'COMPLETED';
        updateAdminUI();
        updateStudentOrders();
        updateCartOrdersPage();
        updateOrderHistoryPage();
        setTimeout(() => recentlyCompletedOrders.delete(id), 10000);
    } catch (e) {
        console.error('Complete order error:', e);
        order.status = 'COMPLETED';
        updateAdminUI();
        setTimeout(() => recentlyCompletedOrders.delete(id), 10000);
    }
}

setInterval(() => {
    const dashboard = document.getElementById('ownerDashboard');
    if(dashboard && !dashboard.classList.contains('hidden')) {
        syncOrders().then(() => updateAdminUI()).catch(() => {});
        loadFeedback().then(() => renderOwnerFeedback()).catch(() => {});
    }
}, 5000);
function downloadInvoice(){
    // Get the last order from the current user
    const myOrders = orders.filter(o => o.user === currentUser);
    if (myOrders.length === 0) {
        alert("No orders found!");
        return;
    }
    const lastOrder = myOrders[myOrders.length - 1];

    const invoiceContent = `
Restora Canteen Invoice
-------------------------
Order ID: ${lastOrder.id}
Transaction ID: ${lastOrder.transactionId}
User: ${lastOrder.user}
Restaurant: ${lastOrder.restro}
Items: ${lastOrder.items.map(i => i.name).join(", ")}
Total: ₹${lastOrder.total}
-------------------------
Thank You!
`;

    const blob = new Blob([invoiceContent], { type: "text/plain" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Invoice_" + lastOrder.id + ".txt";

    link.click();
}

// =========================================================
// FEEDBACK PROMPT ON SUCCESS SCREEN
// =========================================================

function rateLastOrder() {
    const id = window._lastOrderIdForFeedback;
    if (id) {
        showOrderFeedbackModal(id);
    } else {
        const myOrders = orders.filter(o => o.user === currentUser);
        if (myOrders.length > 0) {
            showOrderFeedbackModal(myOrders[myOrders.length - 1].id);
        } else {
            alert("No recent order to rate.");
        }
    }
}

// =========================================================
// ADMIN SESSION CONFIG
// =========================================================

function saveSessionConfig() {
    if (!selectedRestaurantId) {
        alert('No canteen selected');
        return;
    }
    const lunchStart = document.getElementById('adminLunchStart').value;
    const lunchEnd = document.getElementById('adminLunchEnd').value;
    const eveningStart = document.getElementById('adminEveningStart').value;
    const eveningEnd = document.getElementById('adminEveningEnd').value;

    // Validate time format (HH:MM AM/PM)
    const timeRegex = /^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/;
    if (!timeRegex.test(lunchStart) || !timeRegex.test(lunchEnd) || !timeRegex.test(eveningStart) || !timeRegex.test(eveningEnd)) {
        alert('Please enter valid times in HH:MM AM/PM format (e.g., 09:00 AM, 02:00 PM)');
        return;
    }

    const payload = {
        lunchStart: lunchStart,
        lunchEnd: lunchEnd,
        eveningStart: eveningStart,
        eveningEnd: eveningEnd
    };

    api.put(`/canteens/${selectedRestaurantId}`, payload).then(result => {
        if (result && !result.error) {
            // Update local canteensList
            const idx = canteensList.findIndex(c => c.id === selectedRestaurantId);
            if (idx !== -1) {
                canteensList[idx].lunchStart = lunchStart;
                canteensList[idx].lunchEnd = lunchEnd;
                canteensList[idx].eveningStart = eveningStart;
                canteensList[idx].eveningEnd = eveningEnd;
            }
            alert('Session timings saved successfully!');
            renderSessionBanner();
        } else {
            alert('Failed to save session timings.');
        }
    }).catch(() => {
        alert('Failed to save session timings.');
    });
}

function loadAdminSessionConfig() {
    const canteen = canteensList.find(c => c.id === selectedRestaurantId);
    if (!canteen) return;
    const lsInput = document.getElementById('adminLunchStart');
    const leInput = document.getElementById('adminLunchEnd');
    const esInput = document.getElementById('adminEveningStart');
    const eeInput = document.getElementById('adminEveningEnd');
    if (lsInput) lsInput.value = canteen.lunchStart || '09:00 AM';
    if (leInput) leInput.value = canteen.lunchEnd || '02:00 PM';
    if (esInput) esInput.value = canteen.eveningStart || '01:30 PM';
    if (eeInput) eeInput.value = canteen.eveningEnd || '08:00 PM';
}
