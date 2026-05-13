require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

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

// ==============================
// AUTH MIDDLEWARE (FIXED)
// ==============================
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET || 'secretkey');
    req.userId = decoded.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// IMPORTANT FIX: force role check properly
const requireEmployer = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.role !== 'employer') {
      return res.status(403).json({ error: 'ONLY_EMPLOYER_CAN_POST_JOBS' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const requireJobseeker = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.role !== 'jobseeker') {
      return res.status(403).json({ error: 'ONLY_JOBSEEKER_ALLOWED' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ==============================
// JOB ROUTE (STRICT FIX)
// ==============================
app.post('/api/jobs', verifyToken, requireEmployer, async (req, res) => {
  const { title, description, company, location, salary } = req.body;

  if (typeof salary !== 'number') {
    return res.status(400).json({ error: 'Salary must be NUMBER' });
  }

  const job = await Job.create({
    title,
    description,
    company,
    location,
    salary,
    postedBy: req.userId
  });

  res.status(201).json({ message: 'Job created', job });
});

// APPLY (ONLY JOBSEEKER)
app.post('/api/jobs/:id/apply', verifyToken, requireJobseeker, async (req, res) => {
  res.json({ message: 'Applied' });
});

// ==============================
// START
// ==============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
