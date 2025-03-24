import { AuthRequest } from "../middleware/authMiddleware";
import { Response } from "express";
import User from "../models/User";

export const checkGazetteAccess = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id).lean();
    res.status(200).json({ hasAccess: !!user?.allowedToDownloadGazette });
    return;
  } catch (error) {
    console.error("❌ Error in loginUser:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
