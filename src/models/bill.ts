import mongoose, { Schema } from "mongoose";

enum PaymentMode {
  CASH = "CASH",
  ONLINE = "ONLINE",
}

enum MakingChargeType {
  FIXED = "FIXED",
  PER_GRAM = "PER_GRAM",
  PERCENTAGE = "PERCENTAGE",
}

const billSchema = new Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
      required: true,
    },
    items: [
      {
        _id: false,
        name: {
          type: String,
          required: true,
        },
        weightInGrams: {
          type: Number,
          required: true,
        },
        ratePer10g: {
          type: Number,
          required: true,
        },
        makingCharge: {
          type: Number,
          required: true,
        },
        makingChargeType: {
          type: String,
          required: true,
          enum: Object.values(MakingChargeType),
        },
        discount: {
          type: Number,
          required: false,
        },
        totalPrice: {
          type: Number,
          required: true,
        },
      },
    ],
    payments: [
      {
        _id: false,
        amountPaid: {
          type: Number,
          required: true,
        },
        paymentMode: {
          type: String,
          required: true,
          enum: Object.values(PaymentMode),
        },
        paymentDate: {
          type: Date,
          required: true,
        },
        referenceId: {
          type: String,
          required: false,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: false,
    },
    balanceDues: {
      type: Number,
      required: false,
    },
    billDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);
// Index for customerId and createdAt (for date range queries)
billSchema.index({ customerId: 1 });
billSchema.index({ createdAt: -1 });

billSchema.virtual("customer", {
  ref: "customer",
  localField: "customerId",
  foreignField: "_id",
  justOne: true,
});

billSchema.set("toJSON", { virtuals: true });
billSchema.set("toObject", { virtuals: true });
billSchema.set("id", false);

export default mongoose.model<typeof billSchema>("bill", billSchema);
