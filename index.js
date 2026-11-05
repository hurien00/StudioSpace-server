import express from 'express';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";

const app = express();
const port = process.env.PORT || 8000;

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const JWT_COOKIE_NAME = "studio_token";

const JWKS = createRemoteJWKSet(new URL(`${CLIENT_URL}/api/auth/jwks`));

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

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

    const auth = betterAuth({
      baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8000",
      secret: process.env.BETTER_AUTH_SECRET,
      database: mongodbAdapter(db, { client }),
      emailAndPassword: { enabled: true },
      plugins: [jwt({ jwt: { expirationTime: "7d" } })],
      session: {
        cookieCache: {
          enabled: true,
          strategy: 'jwt',
          maxAge: 7 * 24 * 60 * 60
        }
      }
    });

    app.all("/api/auth/*splat", toNodeHandler(auth));

    const verifyToken = async (req, res, next) => {
      const cookieToken = req.cookies?.[JWT_COOKIE_NAME];
      const authHeader = req.headers.authorization;
      const bearerToken =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;

      const token = cookieToken || bearerToken;

      if (!token) {
        return res.status(401).send({
          message: "401 Unauthorized: Please sign in to continue",
        });
      }

      try {
        const { payload } = await jwtVerify(token, JWKS);

        if (!payload.email) {
          return res.status(401).send({
            message: "401 Unauthorized: Token does not contain a user",
          });
        }

        req.user = {
          ...payload,
          id: payload.sub ?? payload.id,
        };

        return next();
      } catch (error) {
        console.error("JWT verification failed:", error.message);
        return res.status(401).send({
          message: "401 Unauthorized: Invalid or expired token",
        });
      }
    };

    app.get('/', (req, res) => {
      res.send({ message: 'StudioSpace Server is running fine' });
    });

    app.get('/api/studios/featured', async (req, res) => {
      try {
        const featuredStudios = await studiosCollection.find({}).sort({ rating: -1 }).limit(6).toArray();
        return res.status(200).send(featuredStudios);
      } catch (error) {
        console.error("Error fetching featured studios:", error);
        return res.status(500).send({ message: "Failed to fetch featured studios" });
      }
    });

    app.get('/api/studios/my-listings', verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const query = { $or: [{ userEmail: email }, { ownerEmail: email }] };
        const result = await studiosCollection.find(query).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching user listings:", error);
        return res.status(500).send({ message: "Failed to fetch user listings" });
      }
    });

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

    app.get('/api/studios', async (req, res) => {
      try {
        const result = await studiosCollection.find({}).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching all studios:", error);
        return res.status(500).send({ message: "Failed to fetch all studios" });
      }
    });

    app.post('/api/studios', verifyToken, async (req, res) => {
      try {
        const { title, category, hourlyRate, securityDeposit, maxCapacity, location, image, amenities, overview } = req.body;
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
          userName: req.user.name,
          userEmail: req.user.email,
          createdAt: new Date()
        };
        const result = await studiosCollection.insertOne(studioData);
        return res.status(201).send({ message: "Studio added successfully", studioId: result.insertedId });
      } catch (error) {
        console.error("Error adding studio:", error);
        return res.status(500).send({ message: "Failed to add studio" });
      }
    });

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

    app.post('/api/bookings', verifyToken, async (req, res) => {
      try {
        const bookingData = req.body;
        const { studioId, date, startTime, hours } = bookingData;

        if (!studioId || !date || !startTime || !hours) {
          return res.status(400).send({ message: "Required booking fields (studioId, date, startTime, hours) are missing" });
        }

        const [startHour, startMinute] = startTime.split(":").map(Number);
        const newBookingStartMinutes = startHour * 60 + startMinute;
        const newBookingEndMinutes = newBookingStartMinutes + Number(hours) * 60;

        const existingBookings = await bookingsCollection.find({
          studioId: studioId,
          date: date,
          status: { $in: ["Pending", "Confirmed"] }
        }).toArray();

        for (const existing of existingBookings) {
          if (existing.startTime && existing.hours) {
            const [exStartH, exStartM] = existing.startTime.split(":").map(Number);
            const existingStartMinutes = exStartH * 60 + exStartM;
            const existingEndMinutes = existingStartMinutes + Number(existing.hours) * 60;

            const isOverlapping = 
              newBookingStartMinutes < existingEndMinutes && 
              newBookingEndMinutes > existingStartMinutes;

            if (isOverlapping) {
              return res.status(409).send({ 
                message: `Time slot collision! This studio is already booked from ${existing.startTime} for ${existing.hours} hours on this date.` 
              });
            }
          }
        }

        const newBooking = {
          ...bookingData,
          hours: Number(hours),
          totalPrice: Number(bookingData.totalPrice || 0),
          userEmail: req.user.email,
          userName: req.user.name || "User",
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

    app.get('/api/bookings', verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const result = await bookingsCollection.find({ userEmail: email }).toArray();
        return res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching bookings:", error);
        return res.status(500).send({ message: "Failed to fetch bookings" });
      }
    });

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

    app.listen(port, () => {
      console.log(`StudioSpace server active on port ${port}`);
    });

  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);