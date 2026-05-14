require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(bodyParser.json());

// ==============================
// DB
// ==============================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error(err));

// ==============================
// MODELS
// ==============================
const User = mongoose.model('User', new mongoose.Schema({
  email: String,
  password: String,
  role: String
}));

const Job = mongoose.model('Job', new mongoose.Schema({
  title: String,
  description: String,
  company: String,
  location: String,
  salary: Number,
  postedBy: mongoose.Schema.Types.ObjectId,
  postedAt: { type: Date, default: Date.now }
}));

const Application = mongoose.model('Application', new mongoose.Schema({
  jobId: mongoose.Schema.Types.ObjectId,
  applicantId: mongoose.Schema.Types.ObjectId,
  appliedAt: { type: Date, default: Date.now }
}));

// ==============================
// AUTH MIDDLEWARE
// ==============================
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(
      token.replace('Bearer ', ''),
      process.env.JWT_SECRET || 'secretkey'
    );
    req.userId = decoded.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ==============================
// AUTH ROUTES (ANDROID SAFE)
// ==============================
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email exists' });

    await User.create({ email, password, role });

    res.json({ message: 'User created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid login' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '1h' }
    );

    // ✅ ANDROID COMPATIBLE RESPONSE (IMPORTANT)
    res.json({
      token,
      role: user.role,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ==============================
// CLEAN JOB ROUTE
// ==============================
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ postedAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// ==============================
// POST JOB (EMPLOYER ONLY)
// ==============================
app.post('/api/jobs', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.role || user.role.toLowerCase() !== 'employer') {
      return res.status(403).json({ error: 'Only employers can post jobs' });
    }

    let { title, description, company, location, salary } = req.body;

    salary = Number(salary);

    if (isNaN(salary)) {
      return res.status(400).json({ error: 'Salary must be valid number' });
    }

    const job = await Job.create({
      title,
      description,
      company,
      location,
      salary,
      postedBy: req.userId
    });

    res.status(201).json(job);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

