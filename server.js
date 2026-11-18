const express = require("express");
const cors = require("cors");
const path = require("path");
const initSqlJs = require("sql.js");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function startServer() {
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "thiranex-development-secret-change-in-production";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "thiranex.db");
const SQL = await initSqlJs();
const db = fs.existsSync(dbPath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
  : new SQL.Database();
let transactionDepth = 0;
const nativePrepare = db.prepare.bind(db);

function saveDatabase() {
  if (transactionDepth === 0) fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

// Small compatibility layer so the existing project can keep its simple SQL queries.
db.prepare = function (sql) {
  return {
    run: (...args) => {
      const stmt = nativePrepare(sql);
      try {
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          const params = {};
          for (const [key, value] of Object.entries(args[0])) {
            params[/^[:@$]/.test(key) ? key : `@${key}`] = value;
          }
          stmt.bind(params);
        } else {
          stmt.bind(args);
        }
        while (stmt.step()) {}
        const changes = db.getRowsModified();
        const idResult = originalExec("SELECT last_insert_rowid() AS id");
        const lastInsertRowid = idResult[0]?.values[0][0] ?? 0;
        saveDatabase();
        return { changes, lastInsertRowid };
      } finally { stmt.free(); }
    },
    get: (...args) => {
      const stmt = nativePrepare(sql);
      try {
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          const params = {};
          for (const [key, value] of Object.entries(args[0])) params[/^[:@$]/.test(key) ? key : `@${key}`] = value;
          stmt.bind(params);
        } else stmt.bind(args);
        if (!stmt.step()) return undefined;
        const cols = stmt.getColumnNames();
        return Object.fromEntries(cols.map((name, i) => [name, stmt.get()[i]]));
      } finally { stmt.free(); }
    },
    all: (...args) => {
      const stmt = nativePrepare(sql);
      try {
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          const params = {};
          for (const [key, value] of Object.entries(args[0])) params[/^[:@$]/.test(key) ? key : `@${key}`] = value;
          stmt.bind(params);
        } else stmt.bind(args);
        const rows = [];
        const cols = stmt.getColumnNames();
        while (stmt.step()) rows.push(Object.fromEntries(cols.map((name, i) => [name, stmt.get()[i]])));
        return rows;
      } finally { stmt.free(); }
    }
  };
};

const originalExec = db.exec.bind(db);
db.exec = (sql) => { const result = originalExec(sql); saveDatabase(); return result; };
db.pragma = () => originalExec("PRAGMA foreign_keys = ON");
db.transaction = (callback) => (...args) => {
  originalExec("BEGIN TRANSACTION");
  transactionDepth++;
  try {
    const result = callback(...args);
    originalExec("COMMIT");
    transactionDepth--;
    saveDatabase();
    return result;
  } catch (error) {
    originalExec("ROLLBACK");
    transactionDepth--;
    throw error;
  }
};
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  image TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 4.5,
  stock INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, product_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wishlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  UNIQUE(user_id, product_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Placed',
  payment_method TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  pincode TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
`);

function seed() {
  const adminEmail = "admin@thiranex.com";
  const userEmail = "user@thiranex.com";

  if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
    db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)")
      .run("Thiranex Admin", adminEmail, bcrypt.hashSync("admin123", 10), "admin");
  }

  if (!db.prepare("SELECT id FROM users WHERE email=?").get(userEmail)) {
    db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)")
      .run("Demo User", userEmail, bcrypt.hashSync("user123", 10), "customer");
  }

  const count = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (count === 0) {
    const products = [
      ["Classic White Sneakers","Clean everyday sneakers with a comfortable sole.",1299,"Footwear","https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",4.7,25,1],
      ["Urban Backpack","Water-resistant backpack for college, work and travel.",899,"Bags","https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800",4.6,40,1],
      ["Minimal Wrist Watch","Elegant everyday watch with a minimalist dial.",1599,"Accessories","https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800",4.8,18,1],
      ["Wireless Headphones","Comfortable wireless headphones with deep sound.",2199,"Electronics","https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",4.5,15,1],
      ["Cotton Oversized T-Shirt","Soft cotton oversized t-shirt for a relaxed fit.",699,"Fashion","https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",4.4,50,0],
      ["Smart Water Bottle","Reusable insulated bottle for everyday use.",799,"Lifestyle","https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800",4.3,30,0],
      ["Laptop Stand","Adjustable stand for a cleaner and more ergonomic desk.",999,"Electronics","https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800",4.6,20,0],
      ["Canvas Art Set","Artist-friendly canvas and basic painting set.",749,"Art","https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800",4.9,12,1]
    ];
    const stmt = db.prepare("INSERT INTO products(name,description,price,category,image,rating,stock,featured) VALUES(?,?,?,?,?,?,?,?)");
    const insert = db.transaction(() => products.forEach(p => stmt.run(...p)));
    insert();
  }
}
seed();

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Login required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

function admin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

app.get("/api/health", (req,res) => res.json({ ok:true, service:"Thiranex API" }));

app.post("/api/auth/register", (req,res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ message:"Name, valid email and password of at least 6 characters are required." });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)").run(name.trim(), email.trim().toLowerCase(), hash);
    const user = db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(result.lastInsertRowid);
    const token = jwt.sign(user, JWT_SECRET, { expiresIn:"7d" });
    res.status(201).json({ token, user });
  } catch {
    res.status(409).json({ message:"Email is already registered." });
  }
});

app.post("/api/auth/login", (req,res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email=?").get((email||"").trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password||"", user.password))
    return res.status(401).json({ message:"Incorrect email or password." });
  const safe = publicUser(user);
  const token = jwt.sign(safe, JWT_SECRET, { expiresIn:"7d" });
  res.json({ token, user:safe });
});

app.get("/api/auth/me", auth, (req,res) => res.json({ user:req.user }));

app.get("/api/categories", (req,res) => {
  res.json(db.prepare("SELECT DISTINCT category FROM products ORDER BY category").all().map(x=>x.category));
});

app.get("/api/products", (req,res) => {
  const { search="", category="", sort="", featured="" } = req.query;
  let sql = "SELECT * FROM products WHERE 1=1";
  const params = {};
  if (search) { sql += " AND (name LIKE @search OR description LIKE @search)"; params.search = `%${search}%`; }
  if (category) { sql += " AND category=@category"; params.category=category; }
  if (featured==="1") sql += " AND featured=1";
  if (sort==="price_asc") sql += " ORDER BY price ASC";
  else if (sort==="price_desc") sql += " ORDER BY price DESC";
  else if (sort==="rating") sql += " ORDER BY rating DESC";
  else sql += " ORDER BY id DESC";
  res.json(db.prepare(sql).all(params));
});

app.get("/api/products/:id", (req,res) => {
  const product = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!product) return res.status(404).json({ message:"Product not found" });
  res.json(product);
});

function getCart(userId) {
  const items = db.prepare(`
    SELECT c.product_id AS id, c.quantity, p.name, p.price, p.image, p.stock, p.category
    FROM cart_items c JOIN products p ON p.id=c.product_id
    WHERE c.user_id=? ORDER BY c.id DESC
  `).all(userId);
  const total = items.reduce((s,i)=>s+i.price*i.quantity,0);
  const count = items.reduce((s,i)=>s+i.quantity,0);
  return { items, total, count };
}

app.get("/api/cart", auth, (req,res)=>res.json(getCart(req.user.id)));

app.post("/api/cart", auth, (req,res)=>{
  const { productId, quantity=1 } = req.body;
  const product = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
  if (!product) return res.status(404).json({message:"Product not found"});
  const qty = Math.max(1, Number(quantity)||1);
  const existing = db.prepare("SELECT * FROM cart_items WHERE user_id=? AND product_id=?").get(req.user.id,productId);
  const newQty = (existing?.quantity||0)+qty;
  if (newQty > product.stock) return res.status(400).json({message:`Only ${product.stock} item(s) available.`});
  if (existing) db.prepare("UPDATE cart_items SET quantity=? WHERE id=?").run(newQty,existing.id);
  else db.prepare("INSERT INTO cart_items(user_id,product_id,quantity) VALUES(?,?,?)").run(req.user.id,productId,qty);
  res.json(getCart(req.user.id));
});

app.put("/api/cart/:productId", auth, (req,res)=>{
  const quantity = Number(req.body.quantity);
  const product = db.prepare("SELECT stock FROM products WHERE id=?").get(req.params.productId);
  if (!product) return res.status(404).json({message:"Product not found"});
  if (quantity <= 0) db.prepare("DELETE FROM cart_items WHERE user_id=? AND product_id=?").run(req.user.id,req.params.productId);
  else if (quantity > product.stock) return res.status(400).json({message:`Only ${product.stock} item(s) available.`});
  else db.prepare("UPDATE cart_items SET quantity=? WHERE user_id=? AND product_id=?").run(quantity,req.user.id,req.params.productId);
  res.json(getCart(req.user.id));
});

app.delete("/api/cart/:productId", auth, (req,res)=>{
  db.prepare("DELETE FROM cart_items WHERE user_id=? AND product_id=?").run(req.user.id,req.params.productId);
  res.json(getCart(req.user.id));
});

app.get("/api/wishlist", auth, (req,res)=>{
  res.json(db.prepare(`
    SELECT p.* FROM wishlist w JOIN products p ON p.id=w.product_id
    WHERE w.user_id=? ORDER BY w.id DESC
  `).all(req.user.id));
});

app.post("/api/wishlist/:productId", auth, (req,res)=>{
  const existing = db.prepare("SELECT id FROM wishlist WHERE user_id=? AND product_id=?").get(req.user.id,req.params.productId);
  if (existing) db.prepare("DELETE FROM wishlist WHERE id=?").run(existing.id);
  else db.prepare("INSERT INTO wishlist(user_id,product_id) VALUES(?,?)").run(req.user.id,req.params.productId);
  res.json({ wishlist:db.prepare("SELECT product_id FROM wishlist WHERE user_id=?").all(req.user.id).map(x=>x.product_id) });
});

app.post("/api/orders", auth, (req,res)=>{
  const { address, city, pincode, phone, paymentMethod="COD" } = req.body;
  if (!address || !city || !pincode || !phone) return res.status(400).json({message:"Please fill all delivery details."});
  const cart = getCart(req.user.id);
  if (!cart.items.length) return res.status(400).json({message:"Your cart is empty."});
  for (const item of cart.items) {
    if (item.quantity > item.stock) return res.status(400).json({message:`Not enough stock for ${item.name}.`});
  }
  const create = db.transaction(() => {
    const order = db.prepare(`
      INSERT INTO orders(user_id,total,status,payment_method,address,city,pincode,phone)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(req.user.id,cart.total,"Placed",paymentMethod,address,city,pincode,phone);
    const itemStmt = db.prepare("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,?,?,?,?)");
    const stockStmt = db.prepare("UPDATE products SET stock=stock-? WHERE id=?");
    for (const item of cart.items) {
      itemStmt.run(order.lastInsertRowid,item.id,item.name,item.price,item.quantity);
      stockStmt.run(item.quantity,item.id);
    }
    db.prepare("DELETE FROM cart_items WHERE user_id=?").run(req.user.id);
    return order.lastInsertRowid;
  });
  const orderId = create();
  res.status(201).json({message:"Order placed successfully.",orderId});
});

app.get("/api/orders", auth, (req,res)=>{
  const orders = db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  for (const o of orders) o.items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(o.id);
  res.json(orders);
});

app.get("/api/admin/stats", auth, admin, (req,res)=>{
  const products = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c;
  const orders = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) total FROM orders").get().total;
  res.json({products,users,orders,revenue});
});

app.get("/api/admin/orders", auth, admin, (req,res)=>{
  const orders = db.prepare(`
    SELECT o.*, u.name AS user_name, u.email AS user_email
    FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC
  `).all();
  for (const o of orders) o.items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(o.id);
  res.json(orders);
});

app.put("/api/admin/orders/:id", auth, admin, (req,res)=>{
  const allowed = ["Placed","Processing","Shipped","Delivered","Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({message:"Invalid order status"});
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);
  res.json({message:"Order updated"});
});

app.post("/api/admin/products", auth, admin, (req,res)=>{
  const {name,description,price,category,image,rating=4.5,stock=0,featured=0}=req.body;
  if (!name||!description||price===undefined||!category||!image) return res.status(400).json({message:"Missing required fields"});
  const r = db.prepare(`
    INSERT INTO products(name,description,price,category,image,rating,stock,featured)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(name,description,Number(price),category,image,Number(rating),Number(stock),Number(featured)?1:0);
  res.status(201).json(db.prepare("SELECT * FROM products WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/admin/products/:id", auth, admin, (req,res)=>{
  const {name,description,price,category,image,rating=4.5,stock=0,featured=0}=req.body;
  const exists=db.prepare("SELECT id FROM products WHERE id=?").get(req.params.id);
  if(!exists) return res.status(404).json({message:"Product not found"});
  db.prepare(`
    UPDATE products SET name=?,description=?,price=?,category=?,image=?,rating=?,stock=?,featured=?
    WHERE id=?
  `).run(name,description,Number(price),category,image,Number(rating),Number(stock),Number(featured)?1:0,req.params.id);
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id));
});

app.delete("/api/admin/products/:id", auth, admin, (req,res)=>{
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({message:"Product deleted"});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`Thiranex running at http://localhost:${PORT}`));
}

startServer().catch((error) => {
  console.error("Could not start Thiranex:", error);
  process.exit(1);
});
