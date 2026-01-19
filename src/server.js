const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const routes = require("./routes");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { startProductBatchJob } = require("./jobs/productBatchJob");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

// ===== CORS (ĐỦ + ĐÚNG) =====
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);


// ===== Middleware =====
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// ===== Health check =====
app.get("/", (req, res) => {
  res.json({ message: "🚀 Auth Service is running!" });
});

// ===== Routes =====
routes(app);

// ===== DB connect =====
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("✅ Connected to MongoDB");

    // 🚀 START CRON JOBS (QUAN TRỌNG)
    // require("./crons/vnpayRefund.cron");
  })
  .catch((error) =>
    console.error("❌ MongoDB connection error:", error)
  );

// ===== Start Server =====
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Auth Service running on http://localhost:${port}`);

  
  // ✅ Start scheduled jobs
  startProductBatchJob();
});

