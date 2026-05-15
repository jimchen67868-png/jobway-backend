require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(bodyParser.json());

// ==============================
// DB CONNECTION
// ==============================
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("MONGO_URI undefined!");
  process.exit(1);
}

mongoose
  .connect(uri)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB error:", err));

// ==============================
// MODELS
// ==============================
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: String, // employer | jobseeker
});

const User = mongoose.model("User", UserSchema);

const JobSchema = new mongoose.Schema({
  title: String,
  description: String,
  company: String,
  location: String,
  salary: Number,
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  postedAt: { type: Date, default: Date.now },
});

const Job = mongoose.model("Job", JobSchema);

const ApplicationSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  appliedAt: { type: Date, default: Date.now },
});

const Application = mongoose.model("Application", ApplicationSchema);

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  content: String,
  sentAt: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", MessageSchema);

// ==============================
// AUTH MIDDLEWARE
// ==============================
const verifyToken = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ error: "No token" });

  const token = header.replace("Bearer ", "");

  jwt.verify(token, process.env.JWT_SECRET || "secretkey", (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });

    req.userId = decoded.id;
    next();
  });
};

const requireEmployer = async (req, res, next) => {
  const user = await User.findById(req.userId);
  if (!user || user.role !== "employer")
    return res.status(403).json({ error: "Employers only" });

  next();
};

const requireJobseeker = async (req, res, next) => {
  const user = await User.findById(req.userId);
  if (!user || user.role !== "jobseeker")
    return res.status(403).json({ error: "Jobseekers only" });

  next();
};

// ==============================
// AUTH ROUTES
// ==============================

// SIGNUP
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!["employer", "jobseeker"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashed,
      role,
    });

    await user.save();

    res.json({ message: "User created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user)
      return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);

    if (!ok)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "1h" }
    );

    res.json({
      token,
      role: user.role,
      userId: user._id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// JOBS
// ==============================
app.post("/api/jobs", verifyToken, requireEmployer, async (req, res) => {
  try {
    const job = new Job({
      ...req.body,
      postedBy: req.userId,
    });

    await job.save();
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/jobs", async (req, res) => {
  const jobs = await Job.find().populate("postedBy", "email role");
  res.json(jobs);
});

// ==============================
// APPLY
// ==============================
app.post(
  "/api/jobs/:id/apply",
  verifyToken,
  requireJobseeker,
  async (req, res) => {
    const exists = await Application.findOne({
      jobId: req.params.id,
      applicantId: req.userId,
    });

    if (exists)
      return res.status(400).json({ error: "Already applied" });

    const appRow = new Application({
      jobId: req.params.id,
      applicantId: req.userId,
    });

    await appRow.save();

    res.json({ message: "Applied" });
  }
);

// ==============================
// MESSAGES
// ==============================
app.post("/api/messages", verifyToken, async (req, res) => {
  const { receiverId, content } = req.body;

  const msg = new Message({
    sender: req.userId,
    receiver: receiverId,
    content,
  });

  await msg.save();
  res.json(msg);
});

app.get("/api/messages/:userId", verifyToken, async (req, res) => {
  const messages = await Message.find({
    $or: [
      { sender: req.userId, receiver: req.params.userId },
      { sender: req.params.userId, receiver: req.userId },
    ],
  }).sort("sentAt");

  res.json(messages);
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

