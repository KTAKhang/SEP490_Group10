const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const routes = require("./routes");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { startProductBatchJob } = require("./jobs/productBatchJob");

// 👉 SOCKET
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

/* ======================
   CORS
====================== */
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* ======================
   MIDDLEWARE
====================== */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

/* ======================
   HEALTH CHECK
====================== */
app.get("/", (req, res) => {
  res.json({ message: "🚀 Auth Service is running!" });
});

/* ======================
   ROUTES
====================== */
routes(app);

/* ======================
   HTTP SERVER + SOCKET
====================== */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

/* ======================
   SOCKET LOGIC (FILE CỦA BẠN)
====================== */
require("./sockets/chat.socket")(io);

/* ======================
   DB CONNECT
====================== */
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    require("./jobs/autoDeleteFailedOrders");
  })
  .catch((error) =>
    console.error("❌ MongoDB connection error:", error)
  );

/* ======================
   START SERVER
====================== */
server.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${port}`);

  // ✅ Start scheduled jobs
  startProductBatchJob();
});
