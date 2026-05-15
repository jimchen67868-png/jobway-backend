require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
app.use(bodyParser.json());

// ==============================
// MONGODB CONNECTION
// ==============================
const uri = process.env.MONGO_URI;

if (!uri) {
console.error('MONGO_URI undefined! Make sure .env exists with MONGO_URI');
process.exit(1);
}

mongoose.connect(uri)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// ==============================
// MODELS
// ==============================
const UserSchema = new mongoose.Schema({
email: { type: String, unique: true },
password: String,
role: String // employer or jobseeker
});

const User = mongoose.model('User', UserSchema);

const JobSchema = new mongoose.Schema({
title: String,
description: String,
company: String,
location: String,
salary: Number,
postedBy: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
},
postedAt: {
type: Date,
default: Date.now
}
});

const Job = mongoose.model('Job', JobSchema);

const ApplicationSchema = new mongoose.Schema({
jobId: {
type: mongoose.Schema.Types.ObjectId,
ref: 'Job',
required: true
},
applicantId: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true
},
appliedAt: {
type: Date,
default: Date.now
}
});

const Application = mongoose.model('Application', ApplicationSchema);

// ==============================
// CHAT MODEL
// ==============================
const MessageSchema = new mongoose.Schema({
sender: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true
},
receiver: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true
},
content: {
type: String,
required: true
},
sentAt: {
type: Date,
default: Date.now
}
});

const Message = mongoose.model('Message', MessageSchema);

// ==============================
// MIDDLEWARE
// ==============================
const verifyToken = (req, res, next) => {
const token = req.headers['authorization'];

if (!token) {
return res.status(401).json({
error: 'No token provided'
});
}

jwt.verify(
token.replace('Bearer ', ''),
process.env.JWT_SECRET || 'secretkey',
(err, decoded) => {
if (err) {
return res.status(401).json({
error: 'Invalid token'
});
}

req.userId = decoded.id;  
  next();  
}

);
};

const requireEmployer = async (req, res, next) => {
const user = await User.findById(req.userId);

if (!user || user.role !== 'employer') {
return res.status(403).json({
error: 'Only employers allowed'
});
}

next();
};

const requireJobseeker = async (req, res, next) => {
const user = await User.findById(req.userId);

if (!user || user.role !== 'jobseeker') {
return res.status(403).json({
error: 'Only jobseekers allowed'
});
}

next();
};

// ==============================
// AUTH ROUTES
// ==============================
app.post('/api/signup', async (req, res) => {
try {
const { email, password, role } = req.body;

if (!['employer', 'jobseeker'].includes(role)) {  
  return res.status(400).json({  
    error: 'Invalid role'  
  });  
}  

const existing = await User.findOne({ email });  

if (existing) {  
  return res.status(400).json({  
    error: 'Email already exists'  
  });  
}  

const user = new User({  
  email,  
  password,  
  role  
});  

await user.save();  

res.json({  
  message: 'User created'  
});

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

app.post('/api/login', async (req, res) => {
try {
const { email, password } = req.body;

const user = await User.findOne({ email });  

if (!user || user.password !== password) {  
  return res.status(401).json({  
    error: 'Invalid email or password'  
  });  
}  

const token = jwt.sign(  
  { id: user._id },  
  process.env.JWT_SECRET || 'secretkey',  
  { expiresIn: '1h' }  
);  

res.json({  
  token,  
  role: user.role,  
  userId: user._id  
});

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

// ==============================
// JOB ROUTES
// ==============================
app.post('/api/jobs', verifyToken, requireEmployer, async (req, res) => {
try {
const {
title,
description,
company,
location,
salary
} = req.body;

if (isNaN(salary)) {  
  return res.status(400).json({  
    error: 'Salary must be a number'  
  });  
}  

const job = new Job({  
  title,  
  description,  
  company,  
  location,  
  salary: Number(salary),  
  postedBy: req.userId  
});  

await job.save();  

res.status(201).json({  
  message: 'Job posted successfully',  
  job  
});

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

app.get('/api/jobs', async (req, res) => {
try {
const jobs = await Job.find()
.populate('postedBy', 'email role')
.sort({ postedAt: -1 });

res.json(jobs);

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

app.delete('/api/jobs/:id', verifyToken, requireEmployer, async (req, res) => {
try {
const job = await Job.findById(req.params.id);

if (!job) {  
  return res.status(404).json({  
    error: 'Job not found'  
  });  
}  

if (job.postedBy.toString() !== req.userId) {  
  return res.status(403).json({  
    error: 'Not your job'  
  });  
}  

await job.deleteOne();  

res.json({  
  message: 'Job deleted successfully'  
});

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

// ==============================
// APPLICATION ROUTES
// ==============================
app.post('/api/jobs/:id/apply', verifyToken, requireJobseeker, async (req, res) => {
try {
const existing = await Application.findOne({
jobId: req.params.id,
applicantId: req.userId
});

if (existing) {  
  return res.status(400).json({  
    error: 'Already applied'  
  });  
}  

const application = new Application({  
  jobId: req.params.id,  
  applicantId: req.userId  
});  

await application.save();  

res.json({  
  message: 'Applied successfully'  
});

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

app.get('/api/my-applications', verifyToken, requireJobseeker, async (req, res) => {
try {
const applications = await Application.find({
applicantId: req.userId
}).populate('jobId');

res.json(applications);

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

app.get('/api/jobs/:id/applicants', verifyToken, requireEmployer, async (req, res) => {
try {
const job = await Job.findById(req.params.id);

if (!job || job.postedBy.toString() !== req.userId) {  
  return res.status(403).json({  
    error: 'Not your job'  
  });  
}  

const applications = await Application.find({  
  jobId: req.params.id  
}).populate('applicantId', 'email role');  

res.json(applications);

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

// ==============================
// CHAT ROUTES
// ==============================
app.post('/api/messages', verifyToken, async (req, res) => {
try {
const { receiverId, content } = req.body;

if (!receiverId || !content) {  
  return res.status(400).json({  
    error: 'Receiver and content required'  
  });  
}  

const message = new Message({  
  sender: req.userId,  
  receiver: receiverId,  
  content  
});  

await message.save();  

res.status(201).json({  
  message: 'Message sent',  
  data: message  
});

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

app.get('/api/messages/:userId', verifyToken, async (req, res) => {
try {
const otherUserId = req.params.userId;

const messages = await Message.find({  
  $or: [  
    {  
      sender: req.userId,  
      receiver: otherUserId  
    },  
    {  
      sender: otherUserId,  
      receiver: req.userId  
    }  
  ]  
}).sort('sentAt');  

res.json(messages);

} catch (err) {
res.status(500).json({
error: err.message
});
}
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
