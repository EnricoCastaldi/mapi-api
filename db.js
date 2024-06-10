const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://mapiapi:mapiapi@cluster0.lxwkjar.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);

let db;

async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    db = client.db('mapi_api'); // Replace with your database name
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error(err);
  }
  return db;
}

module.exports = connectDB;
