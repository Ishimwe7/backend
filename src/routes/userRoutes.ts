import express from "express";
import {
  registerUser,
  loginUser,
  changePassword,
  requestPasswordReset,
  resetPassword,
  updateUser,
  getUserInfo,
  logoutUser,
  verifyResetCode,
} from "../controllers/userController";
import authMiddleware from "../middleware/authMiddleware";
import { checkGazetteAccess } from "../controllers/gazetteAccess";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/info/:userId", authMiddleware, getUserInfo);
router.put("/update-profile", authMiddleware, updateUser);
router.put("/change-password", authMiddleware, changePassword);
router.post("/request-reset", requestPasswordReset);
router.post("/verify-reset", verifyResetCode);
router.post("/reset-password", resetPassword);
router.get("/gazette-access", authMiddleware, checkGazetteAccess);

export default router;
