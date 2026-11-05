import express from 'express';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

const app = express();
const port = process.env.PORT || 8000;

// Middleware configuration
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

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
    const bookingsCollection = db.collection("bookings");
    
    console.log("Successfully connected to MongoDB!");

    // Initialize Better Auth for backend session management
    const auth = betterAuth({
      database: mongodbAdapter(db, { client }),
      emailAndPassword: { enabled: true },
      plugins: [jwt()],
      session: {
        cookieCache: {
          enabled: true,
          strategy: 'jwt',
          maxAge: 7 * 24 * 60 * 60 
        }
      }
    });

    // Better Auth Session Verification Middleware
    const verifyToken = async (req, res, next) => {
      try {
        const session = await auth.api.getSession({
          headers: req.headers
        });

        if (!session || !session.user) {
          return res.status(401).send({ message: "401 Unauthorized: No valid session found" });
        }

        req.user = session.user;
        next();
      } catch (error) {
        console.error("Session verification error:", error);
        return res.status(401).send({ message: "401 Unauthorized: Invalid or expired session" });
      }
    };

    // Root server status route
    app.get('/', (req, res) => {
      res.send({ message: 'StudioSpace Server is running fine' });
    });

    // Get Featured Studios Route (Public)
    app.get('/api/studios/featured', async (req, res) => {
      try {
        const featuredStudios = await studiosCollection.find({}).sort({ rating: -1 }).limit(6).toArray();
        return res.status(200).send(featuredStudios);
      } catch (error) {
        console.error("Error fetching featured studios:", error);
        return res.status(500).send({ message: "Failed to fetch featured studios" });
      }
    });

    // Get User Specific Listings Route (Protected)
    app.get('/api/studios/my-listings', verifyToken, async (req, res) => {
      try {
        const email = req.query.email || req.user.email;
        if (!email) {
          return res.status(400).send({ message: "Email query parameter is required" });
        }
        const query = { $or: [{ userEmail: email }, { ownerEmail: email }] };
        const result = await studiosCollection.find(query).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching user listings:", error);
        return res.status(500).send({ message: "Failed to fetch user listings" });
      }
    });

    // Get Single Studio by ID Route (Public)
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

    // Get All Studios Route (Public)
    app.get('/api/studios', async (req, res) => {
      try {
        const result = await studiosCollection.find({}).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching all studios:", error);
        return res.status(500).send({ message: "Failed to fetch all studios" });
      }
    });

    // Add New Studio API Route (POST) - Protected by verifyToken
    app.post('/api/studios', verifyToken, async (req, res) => {
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
          userName: userName || req.user.name,
          userEmail: userEmail || req.user.email,
          createdAt: new Date()
        };
        const result = await studiosCollection.insertOne(studioData);
        return res.status(201).send({ message: "Studio added successfully", studioId: result.insertedId });
      } catch (error) {
        console.error("Error adding studio:", error);
        return res.status(500).send({ message: "Failed to add studio" });
      }
    });

    // Update Studio API Route (PUT) - Protected by verifyToken
    app.put('/api/studios/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid studio ID format" });
        }
        const updatedData = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            title: updatedData.title,
            category: updatedData.category,
            hourlyRate: Number(updatedData.hourlyRate),
            maxCapacity: Number(updatedData.maxCapacity || 1),
            location: updatedData.location,
            image: updatedData.image,
            overview: updatedData.overview,
          },
        };
        const result = await studiosCollection.updateOne(filter, updateDoc);
        return res.status(200).send({ message: "Studio updated successfully", result });
      } catch (error) {
        console.error("Error updating studio:", error);
        return res.status(500).send({ message: "Failed to update studio" });
      }
    });

    // Delete Studio by ID Route (DELETE) - Protected by verifyToken
    app.delete('/api/studios/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid studio ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await studiosCollection.deleteOne(query);
        
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Studio not found in database" });
        }

        return res.status(200).send({ message: "Studio deleted successfully", result });
      } catch (error) {
        console.error("Error deleting studio:", error);
        return res.status(500).send({ message: "Failed to delete studio" });
      }
    });

    // Create New Booking Route (POST) - Protected by verifyToken
    app.post('/api/bookings', verifyToken, async (req, res) => {
      try {
        const bookingData = req.body;
        if (!bookingData.studioId || !bookingData.date) {
          return res.status(400).send({ message: "Required booking fields are missing" });
        }
        
        const newBooking = {
          ...bookingData,
          userEmail: bookingData.userEmail || req.user.email,
          status: "Pending",
          createdAt: new Date()
        };

        const result = await bookingsCollection.insertOne(newBooking);
        return res.status(201).send({ message: "Booking created successfully", bookingId: result.insertedId });
      } catch (error) {
        console.error("Error creating booking:", error);
        return res.status(500).send({ message: "Failed to create booking" });
      }
    });

    // Get User Specific Bookings Route (GET) - Protected by verifyToken
    app.get('/api/bookings', verifyToken, async (req, res) => {
      try {
        const email = req.query.email || req.user.email;
        if (!email) {
          return res.status(400).send({ message: "Email query parameter is required" });
        }
        const result = await bookingsCollection.find({ userEmail: email }).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching bookings:", error);
        return res.status(500).send({ message: "Failed to fetch bookings" });
      }
    });

    // Cancel Booking Route (PATCH) - Protected by verifyToken
    app.patch('/api/bookings/:id/cancel', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid booking ID format" });
        }
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: "Cancelled" }
        };

        const result = await bookingsCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Booking not found" });
        }

        return res.status(200).send({ message: "Booking cancelled successfully", result });
      } catch (error) {
        console.error("Error cancelling booking:", error);
        return res.status(500).send({ message: "Failed to cancel booking" });
      }
    });

    // Start Express Server
    app.listen(port, () => {
      console.log(`StudioSpace server active on port ${port}`);
    });

  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);
