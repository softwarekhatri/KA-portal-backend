import { Router } from "express";
import customer from "../models/customer";

const router = Router();

// Get paginated list of customers
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 25;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      customer.find().skip(skip).limit(limit),
      customer.countDocuments(),
    ]);

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
    res.send({ message: "Customer deleted successfully" });
  } catch (err) {
    res.status(500).send({ error: "Failed to delete customer", details: err });
  }
});

// search a customer by name or phone or address
router.get("/search", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== "string") {
      return res.status(400).send({ error: "Query parameter is required" });
    }
    const regex = new RegExp(query, "i"); // case-insensitive search
    const results = await customer.find({
      $or: [{ name: regex }, { phone: regex }, { address: regex }],
    });
    res.send({ data: results });
  } catch (err) {
    res.status(500).send({ error: "Customer Search failed", details: err });
  }
});

export default router;
