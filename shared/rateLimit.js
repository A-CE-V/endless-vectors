import admin from "firebase-admin";
import { db } from "./firebaseAdmin.js";

export async function enforceLimit(req, res, next, type = "conversion") {
  const user = req.user;
  const api = user.api;
  const plan = (user.selectedPlan || "free").toLowerCase();

  if (plan === "deluxe") return next();

  const limitField =
    type === "ai" ? "dailyLimitArtificialTools" : "dailyLimitConversion";

  if (api.requestsToday >= api[limitField]) {
    return res.status(429).json({ error: "Daily limit reached." });
  }

  await db.collection("users").doc(user.id).update({
    "api.requestsToday": admin.firestore.FieldValue.increment(1),
    "api.lastUsed": new Date().toISOString(),
  });

  next();
}
