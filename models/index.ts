import mongoose, { Schema, InferSchemaType } from "mongoose";
import { connectDB } from "@/lib/mongodb";

// Kick off the connection; Mongoose buffers queries until it resolves.
void connectDB().catch((e) => {
  console.error("MongoDB connection failed:", e.message);
});

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ["ADMIN", "MANAGER", "TEAM_LEADER", "EMPLOYEE"] },
    employeeCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    team: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const TeamSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    leader: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const RosterMonthSchema = new Schema(
  {
    month: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    daysInMonth: { type: Number, required: true },
    entries: [
      {
        employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
        shifts: { type: [String], default: [] },
      },
    ],
  },
  { timestamps: true }
);

const ShiftRequestSchema = new Schema(
  {
    type: { type: String, required: true, enum: ["CHANGE", "SWAP"] },
    requester: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Number, required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    currentShift: { type: String, default: "" },
    requestedShift: { type: String, default: "" },
    target: { type: Schema.Types.ObjectId, ref: "User", default: null },
    targetShift: { type: String, default: "" },
    reason: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const AuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: String, default: "" },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };
export type TeamDoc = InferSchemaType<typeof TeamSchema> & { _id: mongoose.Types.ObjectId };
export type RosterMonthDoc = InferSchemaType<typeof RosterMonthSchema> & { _id: mongoose.Types.ObjectId };
export type ShiftRequestDoc = InferSchemaType<typeof ShiftRequestSchema> & { _id: mongoose.Types.ObjectId };
export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema> & { _id: mongoose.Types.ObjectId };

export const UserModel = () =>
  (mongoose.models.User ?? mongoose.model("User", UserSchema)) as mongoose.Model<UserDoc>;
export const TeamModel = () =>
  (mongoose.models.Team ?? mongoose.model("Team", TeamSchema)) as mongoose.Model<TeamDoc>;
export const RosterMonthModel = () =>
  (mongoose.models.RosterMonth ?? mongoose.model("RosterMonth", RosterMonthSchema)) as mongoose.Model<RosterMonthDoc>;
export const ShiftRequestModel = () =>
  (mongoose.models.ShiftRequest ?? mongoose.model("ShiftRequest", ShiftRequestSchema)) as mongoose.Model<ShiftRequestDoc>;
export const AuditLogModel = () =>
  (mongoose.models.AuditLog ?? mongoose.model("AuditLog", AuditLogSchema)) as mongoose.Model<AuditLogDoc>;
