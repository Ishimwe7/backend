import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db";
import userRoutes from "./routes/userRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import UserSubscriptionRoutes from "./routes/userSubscriptionRoutes";
import attemptsRoutes from "./routes/attemptsRoutes";
import subscriptionCleanupService from "./services/SubscriptionCleanupService";
import contactRoute from "./routes/contactRoute";
import paymentRoutes from "./routes/paymentRoutes";

dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "https://umuhanda.netlify.app", // ✅ Allow frontend origin
    credentials: true, // ✅ Allow cookies and authorization headers
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Version"], // ✅ Allow these headers
  })
);

app.use(cookieParser());

app.use("/api/auth", userRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/user-subscription", UserSubscriptionRoutes);
app.use("/api/attempts", attemptsRoutes);
app.use("/api/contact", contactRoute);
app.use("/api", paymentRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server is running on port ${PORT}`));

subscriptionCleanupService.start();

process.on("SIGTERM", () => {
  subscriptionCleanupService.stop();
});
