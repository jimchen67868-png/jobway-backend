const bcrypt = require('bcryptjs');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
app.use(express.json());

// ==============================
// DB CONNECT
// ==============================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// ==============================
// MODELS
// ==============================
const User = mongoose.model('User', new mongoose.Schema({
  email: String,
  password: String,
  role: String
}));

const CompanyProfile = mongoose.model('CompanyProfile', new mongoose.Schema({
  userId: String,
  companyName: String,
  industry: String,
  website: String,
  location: String,
  description: String,
  logo: String
}, { timestamps: true }));

const JobseekerProfile = mongoose.model('JobseekerProfile', new mongoose.Schema({
  userId: String,
  fullName: String,
  phone: String,
  skills: String,
  experience: String,
  resumeUrl: String
}, { timestamps: true }));

const Job = mongoose.model('Job', new mongoose.Schema({
  title: String,
  description: String,
  companyId: String,
  location: String,
  salary: Number,
  postedBy: String,
  createdAt: { type: Date, default: Date.now }
}));

const Application = mongoose.model('Application', new mongoose.Schema({
  jobId: String,
  userId: String,
  resumeUrl: String,
  status: { type: String, default: "pending" }
}));

// ==============================
// AUTH MIDDLEWARE
// ==============================
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.userId = decoded.id;
    req.role = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ==============================
// JOBS
// ==============================
app.post('/api/jobs', verifyToken, async (req, res) => {
  try {
    if (req.role !== "employer") {
      return res.status(403).json({ error: "Only employers can post jobs" });
    }

    const job = await Job.create({
      ...req.body,
      postedBy: req.userId
    });

    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  const jobs = await Job.find().sort({ createdAt: -1 });
  res.json(jobs);
});

// ==============================
// COMPANY PROFILE
// ==============================
app.post('/api/company', verifyToken, async (req, res) => {
  if (req.role !== "employer") {
    return res.status(403).json({ error: "Only employers" });
  }

  const company = await CompanyProfile.findOneAndUpdate(
    { userId: req.userId },
    req.body,
    { upsert: true, new: true }
  );

  res.json(company);
});

// ==============================
// JOBSEEKER PROFILE
// ==============================
app.post('/api/profile', verifyToken, async (req, res) => {
  if (req.role !== "jobseeker") {
    return res.status(403).json({ error: "Only jobseekers" });
  }

  const profile = await JobseekerProfile.findOneAndUpdate(
    { userId: req.userId },
    req.body,
    { upsert: true, new: true }
  );

  res.json(profile);
});

// ==============================
// RESUME UPLOAD
// ==============================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

app.post('/api/profile/resume', verifyToken, upload.single('resume'), async (req, res) => {
  if (req.role !== "jobseeker") {
    return res.status(403).json({ error: "Only jobseekers" });
  }

  const profile = await JobseekerProfile.findOneAndUpdate(
    { userId: req.userId },
    { resumeUrl: req.file.path },
    { new: true }
  );

  res.json(profile);
});

// ==============================
// APPLY JOB
// ==============================
app.post('/api/jobs/:id/apply', verifyToken, async (req, res) => {
  if (req.role !== "jobseeker") {
    return res.status(403).json({ error: "Only jobseekers" });
  }

  const appData = await Application.create({
    jobId: req.params.id,
    userId: req.userId,
    resumeUrl: req.body.resumeUrl
  });

  res.json(appData);
});

// ==============================
// SERVER START
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));

// ==============================
// LOGIN FIX (BCRYPTJS SAFE)
// ==============================
