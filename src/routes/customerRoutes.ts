import { Router } from "express";
import mongoose from "mongoose";
import customer from "../models/customer";
import Bill from "../models/bill";

const router = Router();

// Get paginated list of customers
router.get("/", async (req, res) => {
  try {
    const { query } = req.query;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;

    let filter = {};
    if (query && typeof query === "string") {
      const regex = new RegExp(query, "i");
      filter = {
        $or: [{ name: regex }, { phone: regex }, { address: regex }],
      };
    }

    const [customers, total] = await Promise.all([
      customer.find(filter).skip(skip).limit(limit),
      customer.countDocuments(filter),
    ]);

    // Get bill stats for each customer
    const customerIds = customers.map((c) => c._id);
    type BillStat = {
      _id: mongoose.Types.ObjectId;
      totalBills: number;
      totalDues: number;
    };
    const billStats: BillStat[] = await Bill.aggregate([
      { $match: { customerId: { $in: customerIds } } },
      {
        $group: {
          _id: "$customerId",
          totalBills: { $sum: 1 },
          totalDues: { $sum: { $ifNull: ["$balanceDues", 0] } },
        },
      },
    ]);

    // Map stats to customer
    const statsMap = new Map<string, BillStat>(
      billStats.map((s: BillStat) => [String(s._id), s])
    );
    const data = customers.map((c) => {
      const stats = statsMap.get(String(c._id)) || {
        _id: c._id,
        totalBills: 0,
        totalDues: 0,
      };
      return {
        ...c.toObject(),
        totalBills: stats.totalBills,
        totalDues: stats.totalDues,
      };
    });

    return res.send({
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch customers", details: err });
  }
});

// Create a new customer
router.post("/", async (req, res) => {
  try {
    const newCustomer = new customer(req.body);
    const savedCustomer = await newCustomer.save();
    res.status(201).send(savedCustomer);
  } catch (err) {
    res.status(500).send({ error: "Failed to create customer", details: err });
  }
});

// update a customer
router.patch("/:id", async (req, res) => {
  try {
    const updatedCustomer = await customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedCustomer) {
      return res.status(404).send({ error: "Customer not found" });
    }
    res.send(updatedCustomer);
  } catch (err) {
    res.status(500).send({ error: "Failed to update customer", details: err });
  }
});

// delete a customer by id
router.delete("/:id", async (req, res) => {
  try {
    const deletedCustomer = await customer.findByIdAndDelete(req.params.id);
    if (!deletedCustomer) {
      return res.status(404).send({ error: "Customer not found" });
    }
    // Also delete associated bills
    await Bill.deleteMany({ customerId: req.params.id });
    res.send({ message: "Customer deleted successfully" });
  } catch (err) {
    res.status(500).send({ error: "Failed to delete customer", details: err });
  }
});

export default router;
