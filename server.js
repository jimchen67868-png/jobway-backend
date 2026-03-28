const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection (Render will replace this)
const pool = new Pool({
connectionString: process.env.DATABASE_URL || ""
});

// Test route
app.get("/", (req, res) => {
res.send("JobWay API running 🚀");
});

// Get jobs
app.get("/jobs", async (req, res) => {
try {
const result = await pool.query("SELECT * FROM jobs");
res.json(result.rows);
} catch (err) {
res.json([{ id: 1, title: "Sample Job (no DB yet)" }]);
}
});

// Add job
app.post("/jobs", async (req, res) => {
const { title } = req.body;
try {
await pool.query("INSERT INTO jobs(title) VALUES()", [title]);
res.json({ message: "Job added" });
} catch (err) {
res.json({ error: "DB not connected yet" });
}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log("Server running on port " + PORT);
});
