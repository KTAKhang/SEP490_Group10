const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const routes = require("./routes");
const swaggerDocs = require("./swagger");
const cookieParser = require("cookie-parser");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ===== Middleware =====
// ❌ REMOVED: app.use(cors()) - API Gateway đã handle CORS
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// ===== Test route =====
app.get("/", (req, res) => {
    res.json({ message: "🚀 Auth Service is running!" });
});

// ===== Routes & Swagger =====
routes(app); // 👉 trong này có "/auth"
swaggerDocs(app);

// ===== DB connect =====
mongoose
    .connect(process.env.MONGO_URL)
    .then(() => {
        console.log("✅ Connected to MongoDB");
        console.log(`📘 Swagger Docs available at http://localhost:${port}/api-docs`);
    })
    .catch((error) => {
        console.error("❌ MongoDB connection error:", error);
    });

// ===== Start Server =====
app.listen(port, () => {
    console.log(`🚀 Auth Service running on http://localhost:${port}`);
});