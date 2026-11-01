import express from 'express';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// MongoDB Client Setup
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const db = client.db("stdio_space");
    const studiosCollection = db.collection("studios");
    const usersCollection = db.collection("users");
    
    console.log("Successfully connected to MongoDB!");

    // Root route
    app.get('/', (req, res) => {
      res.send({ message: 'StudioSpace Server is running fine' });
    });

    // Registration API Route
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, photoURL, password } = req.body;
        if (!email || !password) {
          return res.status(400).send({ message: "Email and password are required" });
        }
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ message: "User already exists with this email" });
        }
        const result = await usersCollection.insertOne({ 
          name, email, photoURL, password, createdAt: new Date() 
        });
        return res.status(201).send({ message: "User registered successfully", userId: result.insertedId });
      } catch (error) {
        console.error("Registration error:", error);
        return res.status(500).send({ message: "Internal server error during registration" });
      }
    });

    // Login API Route
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).send({ message: "Email and password are required" });
        }
        const user = await usersCollection.findOne({ email });
        if (!user || user.password !== password) {
          return res.status(401).send({ message: "Invalid email or password" });
        }
        return res.status(200).send({ 
          message: "Login successful", 
          user: { name: user.name, email: user.email, photoURL: user.photoURL } 
        });
      } catch (error) {
        console.error("Login error:", error);
        return res.status(500).send({ message: "Internal server error during login" });
      }
    });

    // Add New Studio API Route (POST)
    app.post('/api/studios', async (req, res) => {
      try {
        const { title, category, hourlyRate, securityDeposit, maxCapacity, location, image, amenities, overview, userName, userEmail } = req.body;
        if (!title || !category || !hourlyRate || !location || !image) {
          return res.status(400).send({ message: "Required fields are missing" });
        }
        const studioData = {
          title,
          category,
          hourlyRate: Number(hourlyRate),
          securityDeposit: Number(securityDeposit || 0),
          maxCapacity: Number(maxCapacity || 1),
          location,
          image,
          amenities: Array.isArray(amenities) ? amenities : [],
          overview,
          userName,
          userEmail,
          createdAt: new Date()
        };
        const result = await studiosCollection.insertOne(studioData);
        return res.status(201).send({ message: "Studio added successfully", studioId: result.insertedId });
      } catch (error) {
        console.error("Error adding studio:", error);
        return res.status(500).send({ message: "Failed to add studio" });
      }
    });

    // Get Featured Studios Route
    app.get('/api/studios/featured', async (req, res) => {
      try {
        const featuredStudios = await studiosCollection.find({}).sort({ rating: -1 }).limit(6).toArray();
        return res.status(200).send(featuredStudios);
      } catch (error) {
        console.error("Error fetching featured studios:", error);
        return res.status(500).send({ message: "Failed to fetch featured studios" });
      }
    });

    // Get Single Studio by ID Route
    app.get('/api/studios/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid studio ID format" });
        }
        const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
        if (!studio) {
          return res.status(404).send({ message: "Studio not found in database" });
        }
        return res.status(200).send(studio);
      } catch (error) {
        console.error("Error fetching studio by ID:", error);
        return res.status(500).send({ message: "Failed to fetch studio details" });
      }
    });

    // Get All Studios Route
    app.get('/api/studios', async (req, res) => {
      try {
        const result = await studiosCollection.find({}).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching all studios:", error);
        return res.status(500).send({ message: "Failed to fetch all studios" });
      }
    });

    app.listen(port, () => {
      console.log(`StudioSpace server active on port ${port}`);
    });

  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);