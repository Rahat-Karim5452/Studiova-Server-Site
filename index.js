import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

app.use(cors());
app.use(express.json());

const mongoClient = await connectToMongoDB();

// Database + NEW collection names
const db = mongoClient.db("studiospace_db");
const spaceCollection = db.collection("creative_spaces"); // was: studios
const reservationCollection = db.collection("reservations"); // was: bookings

// JWT security

// BetterAuth
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }
};

const verifyEmail = (req, res, next) => {
  if (req.params.email !== req.user.email) {
    return res.status(403).send({ msg: "Forbidden!" });
  }
  next();
};

const isValidId = (id) => typeof id === "string" && ObjectId.isValid(id);
const isDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):00$/.test(value);

const getStudioData = (body) => ({
  title: String(body.title || "").trim(),
  category: String(body.category || "").trim(),
  hourlyRate: Number(body.hourlyRate),
  securityDeposit: Number(body.securityDeposit) || 0,
  maxCapacity: Number(body.maxCapacity),
  location: String(body.location || "").trim(),
  imageUrl: String(body.imageUrl || "").trim(),
  amenities: Array.isArray(body.amenities) ? body.amenities.map(String) : [],
  overview: String(body.overview || "").trim(),
});

const isValidStudio = (studio) =>
  studio.title &&
  studio.category &&
  studio.location &&
  studio.overview &&
  studio.imageUrl.startsWith("https://") &&
  studio.hourlyRate > 0 &&
  studio.maxCapacity > 0 &&
  studio.securityDeposit >= 0;

app.post("/add-studio", verifyToken, async (req, res) => {
  const data = getStudioData(req.body);

  if (!isValidStudio(data)) {
    return res
      .status(400)
      .send({ msg: "Please fill in every field correctly" });
  }

  const studio = {
    ...data,
    gallery: [],
    ownerEmail: req.user.email,
    ownerName: req.user.name,
    ownerPhoto: req.user.image || "",
    rating: 0,
    reviews: [],
    createdAt: new Date(),
  };

  const result = await spaceCollection.insertOne(studio);
  res.send(result);
});

app.get("/studios", async (req, res) => {
  const { search, category, sort } = req.query;
  const query = {};

  if (category) {
    query.category = String(category);
  }

  if (search) {
    const text = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: text, $options: "i" } },
      { location: { $regex: text, $options: "i" } },
    ];
  }

  let sortBy = { createdAt: -1 };
  if (sort === "price-asc") sortBy = { hourlyRate: 1 };
  if (sort === "price-desc") sortBy = { hourlyRate: -1 };
  if (sort === "rating") sortBy = { rating: -1 };

  const result = await spaceCollection.find(query).sort(sortBy).toArray();
  res.send(result);
});

app.get("/featured-studios", async (req, res) => {
  const result = await spaceCollection
    .find()
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .toArray();
  res.send(result);
});

app.get("/studio/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid id" });
  }

  const result = await spaceCollection.findOne({ _id: new ObjectId(id) });

  if (!result) {
    return res.status(404).send({ msg: "Studio not found" });
  }

  res.send(result);
});

app.get("/my-studios/:email", verifyToken, verifyEmail, async (req, res) => {
  const { email } = req.params;
  const result = await spaceCollection
    .find({ ownerEmail: email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

app.patch("/studio/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid id" });
  }

  const studio = await spaceCollection.findOne({ _id: new ObjectId(id) });

  if (!studio) {
    return res.status(404).send({ msg: "Studio not found" });
  }

  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).send({ msg: "Forbidden!" });
  }

  const data = getStudioData(req.body);

  if (!isValidStudio(data)) {
    return res
      .status(400)
      .send({ msg: "Please fill in every field correctly" });
  }

  const result = await spaceCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: data },
  );
  res.json(result);
});

app.delete("/studio/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid id" });
  }

  const studio = await spaceCollection.findOne({ _id: new ObjectId(id) });

  if (!studio) {
    return res.status(404).send({ msg: "Studio not found" });
  }

  // only the host of this studio can delete it
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).send({ msg: "Forbidden!" });
  }

  const result = await spaceCollection.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});

// ---------------- Bookings (stored in "reservations") ----------------

app.post("/booking", verifyToken, async (req, res) => {
  const { studioId, date, startTime, endTime } = req.body;

  if (
    !isValidId(studioId) ||
    !isDate(date) ||
    !isTime(startTime) ||
    !isTime(endTime)
  ) {
    return res.status(400).send({ msg: "Studio, date and time are required" });
  }

  if (startTime >= endTime) {
    return res.status(400).send({ msg: "End time must be after start time" });
  }

  // one day of tolerance, because the user can be in a different time zone
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  if (date < yesterday) {
    return res
      .status(400)
      .send({ msg: "Please choose today or a future date" });
  }

  const studio = await spaceCollection.findOne({
    _id: new ObjectId(studioId),
  });

  if (!studio) {
    return res.status(404).send({ msg: "Studio not found" });
  }

  const clash = await reservationCollection.findOne({
    studioId,
    date,
    status: "Confirmed",
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });

  if (clash) {
    return res.status(409).send({
      msg: `This time overlaps a confirmed booking (${clash.startTime} - ${clash.endTime}). Please choose another slot.`,
    });
  }

  const hours = Number(endTime.slice(0, 2)) - Number(startTime.slice(0, 2));

  const booking = {
    studioId,
    studioTitle: studio.title,
    studioImage: studio.imageUrl,
    location: studio.location,
    hostEmail: studio.ownerEmail,
    email: req.user.email,
    userName: req.user.name,
    date,
    startTime,
    endTime,
    hours,
    totalPrice: hours * studio.hourlyRate,
    status: "Pending",
    createdAt: new Date(),
  };

  const result = await reservationCollection.insertOne(booking);
  res.send(result);
});

app.get("/my-bookings/:email", verifyToken, verifyEmail, async (req, res) => {
  const { email } = req.params;
  const result = await reservationCollection
    .find({ email: email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// The creator cancels their own pending booking
app.patch("/my-bookings/:id/cancel", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).send({ msg: "Invalid id" });
  }

  const result = await reservationCollection.updateOne(
    { _id: new ObjectId(id), email: req.user.email, status: "Pending" },
    { $set: { status: "Cancelled" } },
  );

  if (result.matchedCount === 0) {
    return res
      .status(400)
      .send({ msg: "Only your own pending bookings can be cancelled" });
  }

  res.send(result);
});

// Booking requests that other people sent for my studios
app.get("/host-bookings/:email", verifyToken, verifyEmail, async (req, res) => {
  const { email } = req.params;
  const result = await reservationCollection
    .find({ hostEmail: email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// The host confirms, completes or declines a booking
app.patch("/booking/:id/status", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (
    !isValidId(id) ||
    !["Confirmed", "Completed", "Cancelled"].includes(status)
  ) {
    return res.status(400).send({ msg: "Invalid request" });
  }

  const booking = await reservationCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!booking) {
    return res.status(404).send({ msg: "Booking not found" });
  }

  // only the host of the studio can change the status
  if (booking.hostEmail !== req.user.email) {
    return res.status(403).send({ msg: "Forbidden!" });
  }

  // check again before confirming, so two bookings never share a time slot
  if (status === "Confirmed") {
    const clash = await reservationCollection.findOne({
      _id: { $ne: booking._id },
      studioId: booking.studioId,
      date: booking.date,
      status: "Confirmed",
      startTime: { $lt: booking.endTime },
      endTime: { $gt: booking.startTime },
    });

    if (clash) {
      return res.status(409).send({
        msg: "Another confirmed booking already uses this time slot",
      });
    }
  }

  const result = await reservationCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } },
  );
  res.send(result);
});

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

// If anything above fails, send a clean message instead of a stack trace
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).send({ msg: "Server Error!" });
});

// Vercel imports this module as a serverless handler; only bind a port locally.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
}

export default app;
