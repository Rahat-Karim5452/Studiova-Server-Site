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
