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

//Database NEW collection names
const db = mongoClient.db("studiospace_db");
const spaceCollection = db.collection("creative_spaces"); // was: studios
const reservationCollection = db.collection("reservations"); // was: bookings

// ---------------- Studios ----------------

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
    // the host is always the logged in user from the token
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
    // escape special characters so the search text is not used as a pattern
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

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

// If anything above fails, send a clean message instead of a stack trace
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).send({ msg: "Server Error!" });
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});

export default app;
