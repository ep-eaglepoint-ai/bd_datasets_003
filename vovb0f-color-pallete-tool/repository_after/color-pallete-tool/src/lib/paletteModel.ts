import mongoose, { Schema, model } from "mongoose";

const PaletteSchema = new Schema(
  {
    name: { type: String, required: true },
    colors: { type: [String], required: true },
    userId: { type: String, required: true },
    isPublic: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    description: { type: String, default: "" },
    collectionId: { type: String, default: null },
  },
  { timestamps: true },
);

export const Palette =
  mongoose.models.Palette || model("Palette", PaletteSchema);
