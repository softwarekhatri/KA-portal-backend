import mongoose, { Schema } from "mongoose";

const customerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: [String],
      required: false,
    },
    address: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Separate indexes on phone
customerSchema.index({ phone: 1 });

export default mongoose.model<typeof customerSchema>(
  "customer",
  customerSchema
);
