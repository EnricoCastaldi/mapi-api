const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const connectDB = require('./db');
const { ObjectId } = require('mongodb');

const app = express();
const PORT = 5000;
const SECRET_KEY = 'your_secret_key';

app.use(bodyParser.json());
app.use(cors());

// Middleware to verify JWT
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).send('A token is required for authentication');
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
  } catch (err) {
    return res.status(401).send('Invalid Token');
  }
  return next();
};

const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!ObjectId.isValid(id)) {
      console.log(`Invalid ID format for ${paramName}: ${id}`);
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
  };
};

// Add 'kompania' to the JWT token payload
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = await connectDB();
  const user = await db.collection('users').findOne({ email });

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, kompania: user.kompania, permission: user.permission },
    SECRET_KEY,
    { expiresIn: '1h' }
  );
  res.json({ success: true, token, user: { ...user, id: user._id } }); // Ensure id is included in the user object
});

app.post('/bypass-login', async (req, res) => {
  const { email } = req.body;
  const db = await connectDB();
  const user = await db.collection('users').findOne({ email });

  if (!user) {
    return res.json({ success: false, message: 'Invalid email' });
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, kompania: user.kompania, permission: user.permission },
    SECRET_KEY,
    { expiresIn: '1h' }
  );
  res.json({ success: true, token, user });
});

// API endpoints for students
app.get('/students', verifyJWT, async (req, res) => {
  const db = await connectDB();
  let query = {};
  if (req.user.permission !== 'SuperUser') {
    query = { kompania: req.user.kompania };
  }
  const students = await db.collection('students').find(query).toArray();
  res.json(students);
});

app.post('/students', verifyJWT, async (req, res) => {
  const { name, surname, cardType, cardID, QRCode, status, kompania } = req.body;
  const db = await connectDB();
  const result = await db.collection('students').insertOne({ name, surname, cardType, cardID, QRCode, status, kompania });
  res.json({ id: result.insertedId });
});

app.put('/students/:id', verifyJWT, validateObjectId('id'), async (req, res) => {
  const { id } = req.params;
  const { name, surname, cardType, cardID, QRCode, status, kompania } = req.body;
  const db = await connectDB();
  const updateFields = { name, surname, cardType, cardID, QRCode, status, kompania };
  try {
    const result = await db.collection('students').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ id });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'An error occurred while updating the student' });
  }
});

app.delete('/users/:id', verifyJWT, validateObjectId('id'), async (req, res) => {
  const { id } = req.params;
  const db = await connectDB();
  const result = await db.collection('users').deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ id });
});

// Route to fetch meal plans for a specific student
app.get('/mealPlans/:studentID', verifyJWT, validateObjectId('studentID'), async (req, res) => {
  const { studentID } = req.params;
  console.log(`Received request to fetch meal plans for studentID: ${studentID}`);
  const db = await connectDB();
  try {
    const mealPlans = await db.collection('mealPlans').find({ studentID: new ObjectId(studentID) }).toArray();
    res.json(mealPlans);
  } catch (error) {
    console.error(`Error fetching meal plans for studentID: ${studentID}`, error);
    res.status(500).json({ error: 'An error occurred while fetching meal plans' });
  }
});

app.post('/mealPlans', verifyJWT, async (req, res) => {
  try {
    const { studentID, date, mealType } = req.body;
    const db = await connectDB();
    const student = await db.collection('students').findOne({ _id: new ObjectId(studentID) });

    if (!student) {
      return res.status(404).send('Student not found');
    }

    const result = await db.collection('mealPlans').insertOne({
      studentID: new ObjectId(studentID),
      date,
      mealType,
      createdAt: new Date()  // Add timestamp here
    });

    res.json({ 
      id: result.insertedId, 
      studentID, 
      date, 
      mealType, 
      name: student.name, 
      surname: student.surname, 
      kompania: student.kompania,
      createdAt: new Date()  // Return timestamp here
    });
  } catch (error) {
    console.error("Error creating meal plan:", error);
    res.status(400).send('Bad Request');
  }
});

// Ensure data is filtered by 'kompania' when fetching users
app.get('/users', verifyJWT, async (req, res) => {
  const db = await connectDB();
  let query = {};
  if (req.user.permission !== 'SuperUser') {
    query = { kompania: req.user.kompania };
  }
  const users = await db.collection('users').find(query).toArray();
  res.json(users);
});

app.post('/users', verifyJWT, async (req, res) => {
  const { name, surname, email, password, permission, kompania } = req.body;
  const db = await connectDB();
  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = await db.collection('users').insertOne({ name, surname, email, password: hashedPassword, permission, kompania });
  res.json({ id: result.insertedId });
});

app.put('/users/:id', verifyJWT, validateObjectId('id'), async (req, res) => {
  const { id } = req.params;
  const { name, surname, email, password, permission, kompania } = req.body;
  const db = await connectDB();
  const updateFields = { name, surname, email, permission, kompania };

  if (password) {
    updateFields.password = bcrypt.hashSync(password, 10); // Encrypt the password if provided
  }

  try {
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ id });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'An error occurred while updating the user' });
  }
});

app.delete('/students/:id', verifyJWT, validateObjectId('id'), async (req, res) => {
  const { id } = req.params;
  const db = await connectDB();
  const result = await db.collection('students').deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Student not found' });
  }
  res.json({ id });
});

// Ensure data is filtered by 'kompania' when fetching meal plans
app.get('/mealPlans', verifyJWT, async (req, res) => {
  const db = await connectDB();
  let query = {};
  if (req.user.permission !== 'SuperUser') {
    query = { 'studentDetails.kompania': req.user.kompania };
  }
  const mealPlans = await db.collection('mealPlans').aggregate([
    {
      $lookup: {
        from: 'students',
        localField: 'studentID',
        foreignField: '_id',
        as: 'studentDetails'
      }
    },
    { $unwind: '$studentDetails' },
    { $match: query }
  ]).toArray();
  res.json(mealPlans);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
