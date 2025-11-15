import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import env from "dotenv";
import customerRoutes from "./routes/customerRoutes";
import billRoutes from "./routes/billRoutes";

const app = express();
const PORT = 3001;

env.config();
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("Hello from Khatri Alankar portal Backend!");
});

app.use("/customers", customerRoutes);
app.use("/bills", billRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URL!)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err: any) => {
    console.error("MongoDB connection error:", err);
  });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
