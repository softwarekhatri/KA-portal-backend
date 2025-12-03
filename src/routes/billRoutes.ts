import { Router } from "express";
import bill from "../models/bill";
import mongoose from "mongoose";
import crypto from "crypto";

const router = Router();

// POST /bills (merged: paginated + filter/search)
router.post("/getBills", async (req, res) => {
  try {
    const {
      search,
      startDate,
      endDate,
      page: reqPage,
      limit: reqLimit,
      billId,
    } = req.body;
    const page = parseInt(reqPage as string, 10) || 1;
    const limit = parseInt(reqLimit as string, 10) || 25;
    const skip = (page - 1) * limit;

    const match = {} as any;
    // Bill ID filter
    if (billId) {
      try {
        match._id =
          typeof billId === "string"
            ? new mongoose.Types.ObjectId(billId)
            : billId;
      } catch (e) {
        return res.status(400).send({ error: "Invalid billId format" });
      }
    }
    // Date Range Filter
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const pipeline: any[] = [
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      { $match: match },
    ];

    // Search (name / phone / address)
    if (search && typeof search === "string") {
      const regex = new RegExp(search, "i");
      const isNumeric = /^\d+$/.test(search);
      if (isNumeric) {
        pipeline.push({
          $match: {
            $or: [
              { "customer.phone": { $regex: "^" + search } },
              { "customer.name": regex },
              { "customer.address": regex },
            ],
          },
        });
      } else {
        pipeline.push({
          $match: {
            $or: [
              { "customer.name": regex },
              { "customer.address": regex },
              { "customer.phone": { $regex: "^" + search } },
            ],
          },
        });
      }
    }

    // Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Run aggregation
    const bills = await bill.aggregate(pipeline);

    // For total count (without pagination)
    const countPipeline = pipeline.filter(
      (stage) => !("$skip" in stage) && !("$limit" in stage)
    );
    countPipeline.push({ $count: "total" });
    const countResult = await bill.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    res.send({
      data: bills,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch bills", details: err });
  }
});

// Create a new bill with custom _id
router.post("/", async (req, res) => {
  try {
    // Generate unique billId: KA-<hex>
    let unique = false;
    let billId = "";
    let attempts = 0;
    while (!unique && attempts < 5) {
      // 5 bytes = 10 hex chars, enough for 1M unique
      const hex = crypto.randomBytes(5).toString("hex");
      billId = `KA-${hex}`;
      // Check uniqueness
      const exists = await bill.findOne({ _id: billId });
      if (!exists) unique = true;
      attempts++;
    }
    if (!unique) {
      return res
        .status(500)
        .send({ error: "Failed to generate unique billId" });
    }
    const newBill = new bill({ ...req.body, _id: billId });
    const savedBill = await newBill.save();
    res.status(201).send(savedBill);
  } catch (err) {
    res.status(500).send({ error: "Failed to create bill", details: err });
  }
});

// update a bill
router.patch("/:id", async (req, res) => {
  try {
    const updatedBill = await bill.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updatedBill) {
      return res.status(404).send({ error: "Bill not found" });
    }
    res.send(updatedBill);
  } catch (err) {
    res.status(500).send({ error: "Failed to update bill", details: err });
  }
});

// delete a bill by id
router.delete("/:id", async (req, res) => {
  try {
    const deletedBill = await bill.findByIdAndDelete(req.params.id);
    if (!deletedBill) {
      return res.status(404).send({ error: "Bill not found" });
    }
    res.send(deletedBill);
  } catch (err) {
    res.status(500).send({ error: "Failed to delete bill", details: err });
  }
});

export default router;
