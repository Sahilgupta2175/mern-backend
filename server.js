const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect('mongodb+srv://<username>:<password>@cluster0.mongodb.net/mern-posts?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Post Schema
const Post = mongoose.model('Post', {
  caption: String,
  imageUrl: String,
});

// Multer for Image Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Routes
app.post('/posts', upload.single('image'), async (req, res) => {
  const { caption } = req.body;
  const imageUrl = `/uploads/${req.file.filename}`;
  const post = new Post({ caption, imageUrl });
  await post.save();
  res.json(post);
});

app.get('/posts', async (req, res) => {
  const posts = await Post.find();
  res.json(posts);
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));