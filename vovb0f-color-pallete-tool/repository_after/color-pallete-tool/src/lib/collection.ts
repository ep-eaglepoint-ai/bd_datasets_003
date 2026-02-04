import mongoose, { Schema, models, model } from "mongoose";

const CollectionSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    userId: { type: String, required: true },
  },
  { timestamps: true }
);

export const Collection =
  models.Collection || model("Collection", CollectionSchema);
