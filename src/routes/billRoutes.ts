import { Router } from "express";
import bill from "../models/bill";
import customer from "../models/customer";
import crypto from "crypto";

const router = Router();

// POST /getBills
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

    const page = parseInt(reqPage, 10) || 1;
    const limit = parseInt(reqLimit, 10) || 25;
    const skip = (page - 1) * limit;

    // If billId exists - fetch only single document (NO aggregation)
    if (billId) {
      const billDoc = await bill.findById(billId).populate("customerId"); // Customer reference must be populated
      const formatted = billDoc
        ? {
            ...billDoc.toObject(),
            customer: billDoc.customerId, // rename who was populated
            customerId: billDoc.customerId?._id, // keep customerId
          }
        : null;
      return res.json({
        data: formatted ? [formatted] : [],
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      });
    }

    // ----- Filter & Aggregation Pipeline -----
    const match: any = {};

    // Date filter
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
    ];

    // Search filter
    if (search && typeof search === "string") {
      const regex = new RegExp(search, "i");
      const isNumeric = /^\d+$/.test(search);

      pipeline.push({
        $match: {
          $or: [
            { "customer.name": regex },
            { "customer.address": regex },
            ...(isNumeric
              ? [{ "customer.phone": { $regex: "^" + search } }]
              : []),
          ],
        },
      });
    }

    // Clone for count
    const countPipeline = [...pipeline, { $count: "total" }];

    // Pagination
    pipeline.push({ $skip: skip }, { $limit: limit });

    // Execute queries
    const [bills, countResult] = await Promise.all([
      bill.aggregate(pipeline),
      bill.aggregate(countPipeline),
    ]);

    const total = countResult?.[0]?.total || 0;

    return res.json({
      data: bills,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      error: "Failed to fetch bills",
      details: message,
    });
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

// Get api to return total customers, total bills, total paid amount, total dues and sales revenue of last 30 days per each day
// router.get("/summary", async (req, res) => {
//   try {
//     const thirtyDaysAgo = new Date();
//     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
//     const result = await bill.aggregate([
//       {
//         $facet: {
//           totalBills: [{ $count: "count" }],

//           totalPaidAmount: [
//             { $unwind: "$payments" },
//             {
//               $group: {
//                 _id: null,
//                 totalPaid: { $sum: "$payments.amountPaid" },
//               },
//             },
//           ],
//           totalDues: [
//             {
//               $group: {
//                 _id: null,
//                 totalDues: { $sum: "$balanceDues" },
//               },
//             },
//           ],
//           salesRevenue: [
//             { $match: { billDate: { $gte: thirtyDaysAgo } } },
//             { $unwind: "$payments" },
//             {
//               $group: {
//                 _id: {
//                   year: { $year: "$payments.paymentDate" },
//                   month: { $month: "$payments.paymentDate" },
//                   day: { $dayOfMonth: "$payments.paymentDate" },
//                 },
//                 dailyTotal: { $sum: "$payments.amountPaid" },
//               },
//             },
//             {
//               $project: {
//                 _id: 0,
//                 date: {
//                   $dateFromParts: {
//                     year: "$_id.year",
//                     month: "$_id.month",
//                     day: "$_id.day",
//                   },
//                 },
//                 dailyTotal: 1,
//               },
//             },
//             { $sort: { date: 1 } },
//           ],
//         },
//       },
//     ]);

//     // Extract results safely
//     const data = result[0];
//     const customersCount = await customer.countDocuments(); // still separate, but cheap (no unwind)

//     res.send({
//       totalCustomers: customersCount,
//       totalBills: data.totalBills[0]?.count || 0,
//       totalPaidAmount: (data.totalPaidAmount[0]?.totalPaid || 0).toFixed(),
//       totalDues: (data.totalDues[0]?.totalDues || 0).toFixed(),
//       salesRevenue: data.salesRevenue.map((s: any) => ({
//         date: s.date,
//         dailyTotal: s.dailyTotal.toFixed(),
//       })),
//     });
//   } catch (err) {
//     res.status(500).send({ error: "Failed to fetch summary", details: err });
//   }
// });

router.get("/summary", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const result = await bill.aggregate([
      {
        $facet: {
          totalBills: [{ $count: "count" }],
          totalPaidAmount: [
            { $unwind: "$payments" },
            {
              $group: {
                _id: null,
                totalPaid: { $sum: "$payments.amountPaid" },
              },
            },
          ],
          totalDues: [
            {
              $group: {
                _id: null,
                totalDues: { $sum: "$balanceDues" },
              },
            },
          ],
          salesRevenue: [
            { $match: { billDate: { $gte: thirtyDaysAgo } } },
            { $unwind: "$payments" },
            { $match: { "payments.paymentMode": { $ne: "DISCOUNT" } } },
            {
              $group: {
                _id: {
                  year: { $year: "$payments.paymentDate" },
                  month: { $month: "$payments.paymentDate" },
                  day: { $dayOfMonth: "$payments.paymentDate" },
                },
                dailyTotal: { $sum: "$payments.amountPaid" },
              },
            },
            {
              $project: {
                _id: 0,
                date: {
                  $dateFromParts: {
                    year: "$_id.year",
                    month: "$_id.month",
                    day: "$_id.day",
                  },
                },
                dailyTotal: 1,
              },
            },
            { $sort: { date: 1 } },
          ],
        },
      },
    ]);

    // Extract results safely
    const data = result[0];
    const customersCount = await customer.countDocuments();

    res.send({
      totalCustomers: customersCount,
      totalBills: data.totalBills[0]?.count || 0,
      totalPaidAmount: (data.totalPaidAmount[0]?.totalPaid || 0).toFixed(),
      totalDues: (data.totalDues[0]?.totalDues || 0).toFixed(),
      salesRevenue: data.salesRevenue.map((s: any) => ({
        date: s.date,
        dailyTotal: s.dailyTotal.toFixed(),
      })),
    });
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch summary", details: err });
  }
});

export default router;
