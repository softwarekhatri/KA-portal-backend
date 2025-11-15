import { Router } from "express";
import bill from "../models/bill";

const router = Router();

// Get paginated list of bills
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 25;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      bill.find().skip(skip).limit(limit).populate("customer"), // <-- POPULATE CUSTOMER HERE
      bill.countDocuments(),
    ]);

    return res.send({
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch bills", details: err });
  }
});

// Create a new bill
router.post("/", async (req, res) => {
  try {
    const newBill = new bill(req.body);
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

// POST /bills/search
router.post("/search", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.body;

    const match: any = {};

    // ---- Date Range Filter ----
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

    // ---- Search (name / phone / address) ----
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

    // ---- Run aggregation ----
    const bills = await bill.aggregate(pipeline);

    res.send({ data: bills });
  } catch (err) {
    res.status(500).send({ error: "Failed to search bills", details: err });
  }
});

export default router;
