import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import Call from "../modals/Call.js";
import { validateObjectId } from "../middleware/validation.js";

const router = express.Router();

// Get call history for the authenticated user
router.get("/history", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { limit = "20", offset = "0" } = req.query;

    const calls = await Call.find({
      $or: [{ callerId: userId }, { receiverId: userId }],
    })
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate("callerId", "name avatar email")
      .populate("receiverId", "name avatar email")
      .populate("conversationId", "name avatar");

    const total = await Call.countDocuments({
      $or: [{ callerId: userId }, { receiverId: userId }],
    });

    res.json({
      success: true,
      data: calls,
      total,
    });
  } catch (error) {
    console.error("[DEBUG] Call: Error getting call history:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get call history",
    });
  }
});

// Get call details by ID
router.get("/:callId", authenticateToken, validateObjectId('callId'), async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { callId } = req.params;

    const call = await Call.findById(callId)
      .populate("callerId", "name avatar email")
      .populate("receiverId", "name avatar email")
      .populate("conversationId", "name avatar");

    if (!call) {
      return res.status(404).json({
        success: false,
        msg: "Call not found",
      });
    }

    // Verify user is part of this call
    const callerIdStr = call.callerId?.toString() || '';
    const receiverIdStr = call.receiverId?.toString() || '';
    
    if (callerIdStr !== userId && receiverIdStr !== userId) {
      return res.status(403).json({
        success: false,
        msg: "Not authorized to view this call",
      });
    }

    res.json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error("[DEBUG] Call: Error getting call details:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get call details",
    });
  }
});

// Delete a call record (optional)
router.delete("/:callId", authenticateToken, validateObjectId('callId'), async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { callId } = req.params;

    const call = await Call.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        msg: "Call not found",
      });
    }

    // Only the caller can delete the call record
    const callerIdStr = call.callerId?.toString() || '';
    
    if (callerIdStr !== userId) {
      return res.status(403).json({
        success: false,
        msg: "Not authorized to delete this call",
      });
    }

    await Call.findByIdAndDelete(callId);

    res.json({
      success: true,
      msg: "Call deleted successfully",
    });
  } catch (error) {
    console.error("[DEBUG] Call: Error deleting call:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete call",
    });
  }
});

export default router;
