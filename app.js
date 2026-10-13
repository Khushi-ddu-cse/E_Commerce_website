
/* =========================================
   1. BASIC SETUP
========================================= */

const API = "/api";

let token = localStorage.getItem("thiranex_token") || "";

let currentUser = JSON.parse(
    localStorage.getItem("thiranex_user") || "null"
);

let categories = [];

// Short helper to select HTML elements
const $ = (selector) => document.querySelector(selector);

// Escape HTML characters before displaying user or product data
const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));

// Format prices in Indian Rupees
function money(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN", {
        maximumFractionDigits: 0
    });
}


/* =========================================
   2. TOAST AND MODAL FUNCTIONS
========================================= */

// Show a small notification
function toast(message) {
    const element = $("#toast");

    element.textContent = message;
    element.classList.add("show");

    setTimeout(() => {
        element.classList.remove("show");
    }, 2400);
}

// Open a popup window
function openModal(html) {
    $("#modalContent").innerHTML =
        `<button class="modal-close" onclick="closeModal()">×</button>${html}`;

    $("#modal").classList.remove("hidden");
}

// Close the popup
function closeModal() {
    $("#modal").classList.add("hidden");
}

// Close the popup when clicking outside its content
function closeOnBackdrop(event) {
    if (event.target.id === "modal") {
        closeModal();
    }
}


/* =========================================
   3. API AND AUTHENTICATION HEADERS
========================================= */

// Add the login token to API requests when available
function headers() {
    return token
        ? {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        }
        : {
            "Content-Type": "application/json"
        };
}

// Send a request to the backend
async function api(path, options = {}) {
    const response = await fetch(API + path, {
        ...options,
        headers: {
            ...headers(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
    }

    return data;
}

// Open or close the mobile navigation menu
function toggleMenu() {
    const nav = $("#navLinks");

    nav.style.display =
        nav.style.display === "flex" ? "none" : "flex";
}


/* =========================================
   4. INITIALIZE THE WEBSITE
========================================= */

async function init() {
    try {
        await loadCategories();
        await loadProducts();

        updateAuthUI();

        if (token) {
            try {
                await api("/auth/me");
                await refreshCart();
            } catch {
                logout(false);
            }
        }

        if (!location.hash) {
            location.hash = "#home";
        }
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   5. LOAD PRODUCT CATEGORIES
========================================= */

async function loadCategories() {
    categories = await api("/categories");

    // Fill the category dropdown
    $("#categorySelect").innerHTML =
        '<option value="">All categories</option>' +
        categories.map(category =>
            `<option value="${esc(category)}">${esc(category)}</option>`
        ).join("");

    // Display an icon for each category
    const icons = [
        "🛍️", "🎧", "👕", "🎨",
        "⌚", "🎒", "🏠", "✨"
    ];

    $("#categoryGrid").innerHTML = categories.map((category, index) => `
        <button
            class="category-card"
            onclick="chooseCategory('${esc(category)}')">

            <span class="category-icon">
                ${icons[index % icons.length]}
            </span>

            <strong>${esc(category)}</strong>

            <span>Explore collection →</span>
        </button>
    `).join("");
}

// Select a category and open the shop
function chooseCategory(category) {
    $("#categorySelect").value = category;

    location.hash = "#shop";

    loadProducts();
}


/* =========================================
   6. LOAD AND DISPLAY PRODUCTS
========================================= */

async function loadProducts() {
    const query = new URLSearchParams({
        search: $("#searchInput")?.value || "",
        category: $("#categorySelect")?.value || "",
        sort: $("#sortSelect")?.value || ""
    });

    try {
        const products = await api("/products?" + query);
        renderProducts(products);
    } catch (error) {
        toast(error.message);
    }
}

// Display products in the product grid
function renderProducts(products) {
    const grid = $("#products");

    if (!products.length) {
        grid.innerHTML = `
            <div class="empty">No products found.</div>
        `;
        return;
    }

    grid.innerHTML = products
        .map(product => productCard(product))
        .join("");
}

// Create an individual product card
function productCard(product) {
    return `
        <article class="product">

            <div class="product-img">
                <img
                    src="${esc(product.image)}"
                    alt="${esc(product.name)}"
                    onerror="this.src='https://placehold.co/800x600?text=E-commerce%20Website'">

                <button
                    class="heart"
                    onclick="toggleWish(${product.id})">
                    ♡
                </button>
            </div>

            <div class="product-body">

                <div class="product-category">
                    ${esc(product.category)}
                </div>

                <div class="product-name">
                    ${esc(product.name)}
                </div>

                <div class="rating">
                    ★ ${Number(product.rating).toFixed(1)}
                </div>

                <div class="price">
                    ${money(product.price)}
                </div>

                <div class="stock">
                    ${product.stock > 0
                        ? `${product.stock} in stock`
                        : "Out of stock"}
                </div>

                <div class="product-actions">

                    <button
                        class="add"
                        onclick="addCart(${product.id})"
                        ${product.stock < 1 ? "disabled" : ""}>
                        Add to cart
                    </button>

                    <button
                        class="details"
                        onclick="showProduct(${product.id})">
                        View
                    </button>

                </div>
            </div>
        </article>
    `;
}


/* =========================================
   7. PRODUCT DETAILS
========================================= */

async function showProduct(id) {
    try {
        const product = await api("/products/" + id);

        openModal(`
            <div class="product-detail">

                <img
                    src="${esc(product.image)}"
                    alt="${esc(product.name)}">

                <div>
                    <p class="eyebrow">
                        ${esc(product.category)}
                    </p>

                    <h2>${esc(product.name)}</h2>

                    <div class="rating">
                        ★ ${product.rating}
                    </div>

                    <div class="big-price">
                        ${money(product.price)}
                    </div>

                    <p class="muted">
                        ${esc(product.description)}
                    </p>

                    <p class="${product.stock ? "success" : ""}">
                        ${product.stock
                            ? product.stock + " units available"
                            : "Out of stock"}
                    </p>

                    <button
                        class="btn primary"
                        onclick="addCart(${product.id}); closeModal()"
                        ${!product.stock ? "disabled" : ""}>
                        Add to Cart
                    </button>
                </div>
            </div>
        `);
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   8. LOGIN CHECK AND SHOPPING CART
========================================= */

// Require login before using account features
function requireLogin() {
    if (!token) {
        openAuth();
        toast("Please login first.");
        return false;
    }

    return true;
}

// Add a product to the cart
async function addCart(id) {
    if (!requireLogin()) return;

    try {
        const cart = await api("/cart", {
            method: "POST",
            body: JSON.stringify({
                productId: id
            })
        });

        updateCartCount(cart.count);
        toast("Added to cart");
    } catch (error) {
        toast(error.message);
    }
}

// Update the cart count in the header
function updateCartCount(count) {
    $("#cartCount").textContent = count;
}

// Display the shopping cart
async function showCart() {
    if (!requireLogin()) return;

    try {
        const cart = await api("/cart");

        const rows = cart.items.map(item => `
            <div class="cart-row">

                <img
                    src="${esc(item.image)}"
                    alt="${esc(item.name)}">

                <div>
                    <b>${esc(item.name)}</b>

                    <div>${money(item.price)}</div>

                    <div class="qty">
                        <button
                            onclick="changeQty(${item.id}, ${item.quantity - 1})">
                            −
                        </button>

                        <span>${item.quantity}</span>

                        <button
                            onclick="changeQty(${item.id}, ${item.quantity + 1})">
                            +
                        </button>
                    </div>
                </div>

                <strong>
                    ${money(item.price * item.quantity)}

                    <br>

                    <button
                        class="details"
                        onclick="removeCart(${item.id})">
                        Remove
                    </button>
                </strong>

            </div>
        `).join("");

        openModal(`
            <h2>Your Cart</h2>

            ${rows || '<div class="empty">Your cart is empty.</div>'}

            <div style="display:flex; justify-content:space-between; margin-top:20px; font-size:20px">
                <strong>Total</strong>
                <strong>${money(cart.total)}</strong>
            </div>

            ${cart.items.length
                ? `<button
                    class="btn primary"
                    style="width:100%; margin-top:15px"
                    onclick="checkout()">
                    Proceed to Checkout →
                   </button>`
                : ""}
        `);
    } catch (error) {
        toast(error.message);
    }
}

// Change the quantity of a cart item
async function changeQty(id, quantity) {
    try {
        await api("/cart/" + id, {
            method: "PUT",
            body: JSON.stringify({ quantity })
        });

        await showCart();

        const cart = await api("/cart");
        updateCartCount(cart.count);
    } catch (error) {
        toast(error.message);
    }
}

// Remove a product from the cart
async function removeCart(id) {
    try {
        await api("/cart/" + id, {
            method: "DELETE"
        });

        await showCart();

        const cart = await api("/cart");
        updateCartCount(cart.count);
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   9. SEARCH AND WISHLIST
========================================= */

// Focus the product search field
function openSearch() {
    location.hash = "#shop";
    $("#searchInput").focus();
}

// Display wishlist products
async function showWishlist() {
    if (!requireLogin()) return;

    try {
        const list = await api("/wishlist");

        openModal(`
            <h2>Wishlist</h2>

            <div class="product-grid">
                ${list.length
                    ? list.map(productCard).join("")
                    : '<div class="empty">Your wishlist is empty.</div>'}
            </div>
        `);
    } catch (error) {
        toast(error.message);
    }
}

// Add or remove a product from the wishlist
async function toggleWish(id) {
    if (!requireLogin()) return;

    try {
        await api("/wishlist/" + id, {
            method: "POST"
        });

        toast("Wishlist updated");
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   10. LOGIN AND REGISTRATION
========================================= */

// Open the login/register popup
function openAuth() {
    openModal(`
        <div class="tabs">

            <button
                id="loginTab"
                class="active"
                onclick="authTab('login')">
                Login
            </button>

            <button
                id="registerTab"
                onclick="authTab('register')">
                Register
            </button>

        </div>

        <div id="authForm"></div>
    `);

    authTab("login");
}

// Switch between login and registration forms
function authTab(mode) {
    $("#loginTab").classList.toggle(
        "active",
        mode === "login"
    );

    $("#registerTab").classList.toggle(
        "active",
        mode === "register"
    );

    if (mode === "login") {
        $("#authForm").innerHTML = `
            <form class="form" onsubmit="login(event)">

                <label>
                    Email
                    <input
                        id="loginEmail"
                        type="email"
                        required
                        value="user@thiranex.com">
                </label>

                <label>
                    Password
                    <input
                        id="loginPassword"
                        type="password"
                        required
                        value="user123">
                </label>

                <button>Login</button>

                <small>
                    Demo: user@thiranex.com / user123
                </small>

                <small>
                    Admin: admin@thiranex.com / admin123
                </small>

            </form>
        `;
    } else {
        $("#authForm").innerHTML = `
            <form class="form" onsubmit="register(event)">

                <label>
                    Name
                    <input id="regName" required>
                </label>

                <label>
                    Email
                    <input
                        id="regEmail"
                        type="email"
                        required>
                </label>

                <label>
                    Password
                    <input
                        id="regPassword"
                        type="password"
                        minlength="6"
                        required>
                </label>

                <button>Create account</button>

            </form>
        `;
    }
}

// Log in an existing user
async function login(event) {
    event.preventDefault();

    try {
        const data = await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: $("#loginEmail").value,
                password: $("#loginPassword").value
            })
        });

        saveSession(data);
        closeModal();

        toast("Welcome back, " + data.user.name);

        await refreshCart();
    } catch (error) {
        toast(error.message);
    }
}

// Register a new user
async function register(event) {
    event.preventDefault();

    try {
        const data = await api("/auth/register", {
            method: "POST",
            body: JSON.stringify({
                name: $("#regName").value,
                email: $("#regEmail").value,
                password: $("#regPassword").value
            })
        });

        saveSession(data);
        closeModal();

        toast("Account created successfully");
    } catch (error) {
        toast(error.message);
    }
}

// Save the logged-in user's session
function saveSession(data) {
    token = data.token;
    currentUser = data.user;

    localStorage.setItem("thiranex_token", token);

    localStorage.setItem(
        "thiranex_user",
        JSON.stringify(currentUser)
    );

    updateAuthUI();
}

// Log out the current user
function logout(show = true) {
    token = "";
    currentUser = null;

    localStorage.removeItem("thiranex_token");
    localStorage.removeItem("thiranex_user");

    updateAuthUI();
    updateCartCount(0);

    if (show) {
        toast("Logged out");
    }
}

// Update login and admin buttons
function updateAuthUI() {
    const button = $("#authBtn");

    button.textContent = currentUser
        ? currentUser.name.split(" ")[0]
        : "Login";

    button.onclick = currentUser
        ? showAccount
        : openAuth;

    $("#adminBtn").classList.toggle(
        "hidden",
        currentUser?.role !== "admin"
    );
}

// Refresh the cart count after login
async function refreshCart() {
    if (!token) return;

    try {
        const cart = await api("/cart");
        updateCartCount(cart.count);
    } catch {
        // The cart will refresh on the next successful request.
    }
}


/* =========================================
   11. USER ACCOUNT AND ORDERS
========================================= */

// Display the user's account information
async function showAccount() {
    openModal(`
        <h2>My Account</h2>

        <p class="muted">
            Name: <b>${esc(currentUser.name)}</b>
            <br>
            Email: ${esc(currentUser.email)}
            <br>
            Role: ${esc(currentUser.role)}
        </p>

        <button
            class="btn primary"
            onclick="showOrders()">
            My Orders
        </button>

        <button
            class="btn ghost"
            onclick="logout(); closeModal()">
            Logout
        </button>
    `);
}

// Display the current user's orders
async function showOrders() {
    if (!requireLogin()) return;

    try {
        const orders = await api("/orders");

        openModal(`
            <h2>My Orders</h2>

            ${orders.length
                ? orders.map(order => `
                    <div class="order-card">

                        <div class="order-head">
                            <strong>Order #${order.id}</strong>
                            <span class="status">${esc(order.status)}</span>
                        </div>

                        <p>
                            ${new Date(order.created_at).toLocaleString("en-IN")}
                            · ${money(order.total)}
                            · ${esc(order.payment_method)}
                        </p>

                        <small>
                            ${order.items.map(item =>
                                esc(item.product_name) +
                                " × " + item.quantity
                            ).join(", ")}
                        </small>

                    </div>
                `).join("")
                : '<div class="empty">No orders yet.</div>'}
        `);
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   12. CHECKOUT AND PLACE ORDER
========================================= */

// Open the checkout form
async function checkout() {
    try {
        const cart = await api("/cart");

        if (!cart.items.length) return;

        openModal(`
            <h2>Checkout</h2>

            <form class="form" onsubmit="placeOrder(event)">

                <div class="two-col">

                    <label>
                        Phone
                        <input
                            id="phone"
                            required
                            pattern="[0-9]{10}"
                            placeholder="10 digit mobile">
                    </label>

                    <label>
                        Pincode
                        <input
                            id="pincode"
                            required
                            pattern="[0-9]{6}"
                            placeholder="6 digit pincode">
                    </label>

                </div>

                <label>
                    Address
                    <textarea
                        id="address"
                        required
                        placeholder="House no., street, area"></textarea>
                </label>

                <label>
                    City
                    <input id="city" required>
                </label>

                <label>
                    Payment
                    <select id="payment">
                        <option value="COD">Cash on Delivery</option>
                        <option value="Demo Payment">Demo Payment</option>
                    </select>
                </label>

                <div style="display:flex; justify-content:space-between">
                    <strong>Total</strong>
                    <strong>${money(cart.total)}</strong>
                </div>

                <button>Place Order</button>

            </form>
        `);
    } catch (error) {
        toast(error.message);
    }
}

// Send the order details to the backend
async function placeOrder(event) {
    event.preventDefault();

    try {
        const data = await api("/orders", {
            method: "POST",
            body: JSON.stringify({
                phone: $("#phone").value,
                pincode: $("#pincode").value,
                address: $("#address").value,
                city: $("#city").value,
                paymentMethod: $("#payment").value
            })
        });

        closeModal();

        await refreshCart();

        toast("Order #" + data.orderId + " placed!");

        await showOrders();
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   13. FEATURED PRODUCTS
========================================= */

// Show featured products
async function showFeatured() {
    try {
        const products = await api("/products?featured=1");

        renderProducts(products);

        location.hash = "#shop";
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   14. ADMIN DASHBOARD
========================================= */

// Display the admin dashboard
async function showAdmin() {
    if (currentUser?.role !== "admin") return;

    try {
        const stats = await api("/admin/stats");
        const orders = await api("/admin/orders");
        const products = await api("/products");

        openModal(`
            <h2>Admin Dashboard</h2>

            <div class="admin-stat-grid">

                <div class="stat">
                    <small>Products</small>
                    <strong>${stats.products}</strong>
                </div>

                <div class="stat">
                    <small>Customers</small>
                    <strong>${stats.users}</strong>
                </div>

                <div class="stat">
                    <small>Orders</small>
                    <strong>${stats.orders}</strong>
                </div>

                <div class="stat">
                    <small>Revenue</small>
                    <strong>${money(stats.revenue)}</strong>
                </div>

            </div>

            <hr>

            <h3>Manage Products</h3>

            <button
                class="btn primary"
                onclick="adminProductForm()">
                + Add Product
            </button>

            <div style="overflow:auto; margin-top:12px">

                <table class="admin-table">

                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Action</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${products.map(product => `
                            <tr>
                                <td>
                                    <img
                                        src="${esc(product.image)}"
                                        alt="">
                                    ${esc(product.name)}
                                </td>

                                <td>${money(product.price)}</td>
                                <td>${product.stock}</td>

                                <td>
                                    <button
                                        class="details"
                                        onclick='adminProductForm(${JSON.stringify(product).replace(/'/g, "&#39;")})'>
                                        Edit
                                    </button>

                                    <button
                                        class="details danger"
                                        onclick="deleteProduct(${product.id})">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>

                </table>
            </div>

            <h3>Orders</h3>

            ${orders.slice(0, 10).map(order => `
                <div class="order-card">

                    <div class="order-head">

                        <b>
                            #${order.id} · ${esc(order.user_name)}
                        </b>

                        <select
                            onchange="updateOrder(${order.id}, this.value)">

                            ${[
                                "Placed",
                                "Processing",
                                "Shipped",
                                "Delivered",
                                "Cancelled"
                            ].map(status => `
                                <option
                                    ${status === order.status ? "selected" : ""}>
                                    ${status}
                                </option>
                            `).join("")}

                        </select>

                    </div>

                    <small>
                        ${money(order.total)}
                        · ${esc(order.user_email)}
                    </small>

                </div>
            `).join("")}
        `);
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   15. ADD OR EDIT PRODUCTS
========================================= */

// Display the add/edit product form
function adminProductForm(product = null) {
    const item = product || {
        name: "",
        description: "",
        price: "",
        category: "Fashion",
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
        rating: 4.5,
        stock: 10,
        featured: 0
    };

    openModal(`
        <h2>${product ? "Edit" : "Add"} Product</h2>

        <form
            class="form"
            onsubmit="saveProduct(event, ${product ? product.id : "null"})">

            <label>
                Name
                <input
                    id="pn"
                    required
                    value="${esc(item.name)}">
            </label>

            <label>
                Description
                <textarea id="pd" required>${esc(item.description)}</textarea>
            </label>

            <div class="two-col">

                <label>
                    Price
                    <input
                        id="pp"
                        type="number"
                        min="0"
                        required
                        value="${item.price}">
                </label>

                <label>
                    Stock
                    <input
                        id="ps"
                        type="number"
                        min="0"
                        required
                        value="${item.stock}">
                </label>

            </div>

            <div class="two-col">

                <label>
                    Category
                    <input
                        id="pc"
                        required
                        value="${esc(item.category)}">
                </label>

                <label>
                    Rating
                    <input
                        id="pr"
                        type="number"
                        min="0"
                        max="5"
                        step=".1"
                        value="${item.rating}">
                </label>

            </div>

            <label>
                Image URL
                <input
                    id="pi"
                    required
                    value="${esc(item.image)}">
            </label>

            <label>
                <input
                    id="pf"
                    type="checkbox"
                    ${item.featured ? "checked" : ""}>
                Featured product
            </label>

            <button>Save Product</button>

        </form>
    `);
}

// Save a new product or update an existing product
async function saveProduct(event, id) {
    event.preventDefault();

    const body = {
        name: $("#pn").value,
        description: $("#pd").value,
        price: $("#pp").value,
        stock: $("#ps").value,
        category: $("#pc").value,
        rating: $("#pr").value,
        image: $("#pi").value,
        featured: $("#pf").checked ? 1 : 0
    };

    try {
        await api(
            id ? "/admin/products/" + id : "/admin/products",
            {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(body)
            }
        );

        toast("Product saved");

        await showAdmin();
    } catch (error) {
        toast(error.message);
    }
}

// Delete a product
async function deleteProduct(id) {
    if (!confirm("Delete this product?")) return;

    try {
        await api("/admin/products/" + id, {
            method: "DELETE"
        });

        toast("Product deleted");

        await showAdmin();
    } catch (error) {
        toast(error.message);
    }
}

// Update an order's status
async function updateOrder(id, status) {
    try {
        await api("/admin/orders/" + id, {
            method: "PUT",
            body: JSON.stringify({ status })
        });

        toast("Order updated");
    } catch (error) {
        toast(error.message);
    }
}


/* =========================================
   16. EVENT LISTENERS
========================================= */

// Handle the login button
$("#authBtn").addEventListener("click", () => {
    if (currentUser) {
        showAccount();
    } else {
        openAuth();
    }
});

// Open orders when the Orders navigation link is selected
window.addEventListener("hashchange", () => {
    if (location.hash === "#orders") {
        showOrders();
    }
});


/* =========================================
   17. START THE WEBSITE
========================================= */

init();
