const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("backend/public"));
// Default route → open login page
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/login.html");
});

// Create / Connect Database
const db = new sqlite3.Database("./backend/database.db", (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});
// Create Tables
db.serialize(() => {

    // Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('Admin','Vendor','Employee')) NOT NULL,
            status TEXT DEFAULT 'Pending'
        )
    `);

    // Products Table
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER DEFAULT 0,
            FOREIGN KEY (vendor_id) REFERENCES users(id)
        )
    `);

    // Orders Table
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            vendor_id INTEGER,
            total_amount REAL,
            status TEXT DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES users(id),
            FOREIGN KEY (vendor_id) REFERENCES users(id)
        )
    `);

    // Order Items Table
    db.run(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id INTEGER,
            quantity INTEGER,
            price REAL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `);

    console.log("All tables created successfully.");
    // Insert Default Admin if not exists
db.get("SELECT * FROM users WHERE email = ?", ["admin@gmail.com"], (err, row) => {
    if (!row) {
        db.run(
            `INSERT INTO users (name, email, password, role, status)
             VALUES (?, ?, ?, ?, ?)`,
            ["Admin", "admin@gmail.com", "admin123", "Admin", "Approved"]
        );
        console.log("Default Admin Created.");
    }
});
});

// Home Route
app.get("/", (req, res) => {
    res.send("Vendor Management System API Running");
});
// Vendor Registration
app.post("/register", (req, res) => {

    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
        return res.json({ message: "All fields are required" });
    }

    let status;

    if (role === "Vendor") {
        status = "Pending";
    } else {
        status = "Approved";
    }

    db.run(
        `INSERT INTO users (name, email, password, role, status)
         VALUES (?, ?, ?, ?, ?)`,
        [name, email, password, role, status],
        function (err) {
            if (err) {
                return res.json({ message: "Email already exists" });
            }

            if (role === "Vendor") {
                res.json({ message: "Registration successful. Wait for Admin approval." });
            } else {
                res.json({ message: "Registration successful. You can login now." });
            }
        }
    );
});
// Login API
app.post("/login", (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ message: "Email and Password required" });
    }

    db.get(
        "SELECT * FROM users WHERE email = ? AND password = ?",
        [email, password],
        (err, user) => {
            if (err) {
                return res.json({ message: "Server error" });
            }

            if (!user) {
                return res.json({ message: "Invalid credentials" });
            }

            if (user.status !== "Approved") {
                return res.json({ message: "Account not approved by Admin" });
            }
           console.log("User from DB:", user);
            res.json({
                message: "Login successful",
                role: user.role,
                 id: user.id,
                name: user.name
            });
        }
    );
});
// Get Pending Users (Admin)
app.get("/pending-users", (req, res) => {

    db.all(
        "SELECT id, name, email, role, status FROM users WHERE status = 'Pending'",
        [],
        (err, rows) => {
            if (err) {
                return res.json({ message: "Error fetching users" });
            }
            res.json(rows);
        }
    );

});
// Approve User (Admin)
app.post("/approve-user", (req, res) => {

    const { id } = req.body;

    db.run(
        "UPDATE users SET status = 'Approved' WHERE id = ?",
        [id],
        function (err) {
            if (err) {
                return res.json({ message: "Error approving user" });
            }
            res.json({ message: "User approved successfully" });
        }
    );

});
// Add Product (Vendor)
app.post("/add-product", (req, res) => {

    const { vendor_id, name, price, cost_price, stock, forceUpdate } = req.body;

    if (!vendor_id || !name || !price || !stock) {
        return res.json({ message: "All fields are required" });
    }

    db.get(
        `SELECT * FROM products WHERE vendor_id = ? AND name = ?`,
        [vendor_id, name],
        (err, row) => {

            if (row && !forceUpdate) {
                // Product exists → ask frontend for confirmation
                return res.json({ message: "Product exists", exists: true });
            }

            if (row && forceUpdate) {
                // Update stock + price
                const newStock = row.stock + parseInt(stock);

                db.run(
                    `UPDATE products 
                     SET stock = ?, price = ? ,cost_price = ?
                     WHERE id = ?`,
                    [newStock, price,cost_price, row.id],
                    function (err) {
                        if (err) {
                            return res.json({ message: "Error updating product" });
                        }
                        res.json({ message: "Product updated successfully" });
                    }
                );

            } else {
                // Insert new
                db.run(
                    `INSERT INTO products (vendor_id, name, price,cost_price, stock)
                     VALUES (?, ?, ?, ?, ?)`,
                    [vendor_id, name, price,cost_price, stock],
                    function (err) {
                        if (err) {
                            return res.json({ message: "Error adding product" });
                        }
                        res.json({ message: "Product added successfully" });
                    }
                );
            }

        }
    );

});
// Update Product
app.post("/update-product", (req, res) => {

    const { id, name, price, cost_price, stock } = req.body;

    db.run(
        `UPDATE products 
         SET name = ?, price = ?, cost_price = ?, stock = ? 
         WHERE id = ?`,
        [name, price, cost_price, stock, id],
        function (err) {
            if (err) {
                return res.json({ message: "Error updating product" });
            }
            res.json({ message: "Product updated successfully" });
        }
    );

});
// Delete Product
app.post("/delete-product", (req, res) => {

    const { id } = req.body;

    db.run(
        `DELETE FROM products WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.json({ message: "Error deleting product" });
            }
            res.json({ message: "Product deleted successfully" });
        }
    );

});
// Get Products by Vendor
app.get("/vendor-products/:vendor_id", (req, res) => {

    const vendor_id = req.params.vendor_id;

    db.all(
    `SELECT orders.id,
            users.name AS employee_name,
            products.name AS product_name,
            order_items.quantity,
            orders.total_amount,
            orders.status
     FROM orders
     JOIN users ON orders.employee_id = users.id
     JOIN order_items ON orders.id = order_items.order_id
     JOIN products ON order_items.product_id = products.id
     WHERE orders.vendor_id = ?`,
    [vendor_id],
        [vendor_id],
        (err, rows) => {
            if (err) {
                return res.json({ message: "Error fetching products" });
            }
            res.json(rows);
        }
    );

});
// Get Vendor Products
app.get("/products/:vendor_id", (req, res) => {

    const vendor_id = req.params.vendor_id;

    db.all(
        `SELECT id, name, price, stock
         FROM products
         WHERE vendor_id = ?`,
        [vendor_id],
        (err, rows) => {
            if (err) {
                return res.json({ message: "Error fetching products" });
            }
            res.json(rows);
        }
    );

});
// Get All Products (Employee View)
app.get("/all-products", (req, res) => {

    db.all(
        `SELECT products.id, products.name, products.price, products.stock,
                users.name AS vendor_name
         FROM products
         JOIN users ON products.vendor_id = users.id`,
        [],
        (err, rows) => {
            if (err) {
                return res.json({ message: "Error fetching products" });
            }
            res.json(rows);
        }
    );

});
// Place Order (Employee)
app.post("/place-order", (req, res) => {

    const { employee_id, product_id, quantity } = req.body;

    db.get(
        "SELECT * FROM products WHERE id = ?",
        [product_id],
        (err, product) => {

            if (!product) {
                return res.json({ message: "Product not found" });
            }

            // Check stock
            if (product.stock < quantity) {
                return res.json({ message: "Not enough stock available" });
            }

            const total_amount = product.price * quantity;

            // Insert order
            db.run(
                `INSERT INTO orders (employee_id, vendor_id, total_amount)
                 VALUES (?, ?, ?)`,
                [employee_id, product.vendor_id, total_amount],
                function (err) {

                    const order_id = this.lastID;

                    // Insert order item
                    db.run(
                        `INSERT INTO order_items (order_id, product_id, quantity, price)
                         VALUES (?, ?, ?, ?)`,
                        [order_id, product_id, quantity, product.price]
                    );

                    // Reduce stock
                    db.run(
                        `UPDATE products SET stock = stock - ? WHERE id = ?`,
                        [quantity, product_id]
                    );

                    res.json({ message: "Order placed successfully" });

                }
            );

        }
    );

});
// Get Orders for Vendor
app.get("/vendor-orders/:vendor_id", (req, res) => {

    const vendor_id = req.params.vendor_id;

    db.all(
        `SELECT 
            orders.id,
            users.name AS employee_name,
            products.name AS product_name,
            order_items.quantity,
            orders.total_amount,
            orders.status
         FROM orders
         JOIN users ON orders.employee_id = users.id
         JOIN order_items ON orders.id = order_items.order_id
         JOIN products ON order_items.product_id = products.id
         WHERE orders.vendor_id = ?`,
        [vendor_id],
        (err, rows) => {
            if (err) {
                return res.json({ message: "Error fetching orders" });
            }
            res.json(rows);
        }
    );

});
// Update Order Status (Vendor)
app.post("/update-order-status", (req, res) => {

    const { order_id, status } = req.body;

    db.run(
        "UPDATE orders SET status = ? WHERE id = ?",
        [status, order_id],
        function (err) {
            if (err) {
                return res.json({ message: "Error updating status" });
            }
            res.json({ message: "Order status updated" });
        }
    );

});
// Get Orders for Employee
app.get("/employee-orders/:employee_id", (req, res) => {

    const employee_id = req.params.employee_id;

    db.all(
        `SELECT orders.id, 
       orders.total_amount,
       orders.status,
       users.name AS vendor_name
         FROM orders
         JOIN users ON orders.vendor_id = users.id
         WHERE orders.employee_id = ?`,
        [employee_id],
        (err, rows) => {

            if (err) {
                return res.json({ message: "Error fetching orders" });
            }

            res.json(rows);
        }
    );

});
// DEBUG: Get All Users
app.get("/all-users", (req, res) => {

    db.all("SELECT id, name, email, role, status FROM users", [], (err, rows) => {

        if (err) {
            return res.json({ message: "Error fetching users" });
        }

        res.json(rows);

    });

});
// Admin Dashboard Statistics
app.get("/admin-stats", (req, res) => {

    const stats = {};

    db.get("SELECT COUNT(*) AS totalUsers FROM users", (err, row) => {
        stats.totalUsers = row.totalUsers;

        db.get("SELECT COUNT(*) AS totalVendors FROM users WHERE role='Vendor'", (err, row) => {
            stats.totalVendors = row.totalVendors;

            db.get("SELECT COUNT(*) AS totalEmployees FROM users WHERE role='Employee'", (err, row) => {
                stats.totalEmployees = row.totalEmployees;

                db.get("SELECT COUNT(*) AS totalProducts FROM products", (err, row) => {
                    stats.totalProducts = row.totalProducts;

                    db.get("SELECT COUNT(*) AS totalOrders FROM orders", (err, row) => {
                        stats.totalOrders = row.totalOrders;

                        db.get(`
    SELECT IFNULL(SUM(total_amount),0) AS totalRevenue
    FROM orders
    WHERE status = 'Delivered'
`, (err, row) => {

    stats.totalRevenue = row.totalRevenue;

    db.get(`
        SELECT IFNULL(SUM(
            (products.price - products.cost_price) * order_items.quantity
        ), 0) AS totalProfit
        FROM orders
        JOIN order_items ON orders.id = order_items.order_id
        JOIN products ON order_items.product_id = products.id
        WHERE orders.status = 'Delivered'
    `, (err, row) => {

        stats.totalProfit = row.totalProfit;

        res.json(stats);
    });

});
                    });

                });

            });

        });

    });

});
// Debug: See all products with vendor_id
app.get("/debug-products", (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) {
            return res.json({ message: "Error fetching products" });
        }
        res.json(rows);
    });
});
app.get("/clear-products", (req, res) => {
    db.run("DELETE FROM products WHERE vendor_id IS NULL OR vendor_id = 'undefined'");
    res.send("Broken products removed");
});
// Add cost_price column safely (runs once)
db.run(`
    ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0
`, (err) => {
    // Ignore error if column already exists
});

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});