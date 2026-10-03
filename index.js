// ========================================
// Imports & Configuration
// ========================================

const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const cors = require("cors");
const app = express();

require("dotenv").config();

const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");


const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { cert } = require("firebase-admin/app");

const SSLCommerzPayment = require('sslcommerz-lts')
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const crypto = require("crypto");

// ========================================
// Server Configuration
// ========================================

const port = process.env.PORT || 3000;


// ========================================
// Firebase Admin Configuration
// ========================================
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: cert(serviceAccount)
})


// ========================================
// Payment Configuration
// ========================================

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false


// ========================================
// Tracking ID Generator
// ========================================

const generateTrackingId = () => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")
    .slice(2);

  const random = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `MPS-${date}-${random}`;
};

console.log(generateTrackingId());


// ========================================
// Middleware
// ========================================

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }))


// ========================================
// Firebase Authentication Middleware
// ========================================

const verifyFBToken = async (req, res, next) => {
  const token = req.headers?.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" })
  }
  try {
    const idToken = token.split(' ')[1];
    const decoded = await getAuth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  }
  catch (err) {
    console.log("Token verification failed:", err);

    return res.status(401).send({
      message: "Unauthorized access",
    });
  }
}

// ========================================
// MongoDB Configuration
// ========================================

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.onvejqf.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ========================================
// Database
// ========================================

// async function run() {
//   try {
//     // Connect the client to the server	(optional starting in v4.7)
//     await client.connect();

client.connect().then(() => {
  console.log("Connected to MongoDB");
}).catch(console.dir);

    const db = client.db("moveNestDB");
    const userCollection = db.collection("users");
    const parcelsCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const ridersCollection = db.collection("riders");


    // ========================================
    // Users APIs
    // ========================================

    app.get("/users", verifyFBToken, async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" })
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollection.findOne({ email })
      if (userExists) {
        return res.send({ message: 'user exists' })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const roleInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: roleInfo.role
        }
      }
      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    })

    // ========================================
    // Parcel APIs
    // ========================================

    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email } = req.query;

      //parcel?email =""&
      if (email) {
        query.senderEmail = email;
      }

      const options = { sort: { createdAt: -1 } };

      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);
      res.send(result);
    });

    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.createdAt = new Date();
      const result = await parcelsCollection.insertOne(parcel);
      res.send(result);
    });

    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);
      res.send(result);
    });


    // ========================================
    // Payment APIs
    // ========================================

    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      if (email) {
        query.customerEmail = email;

        //check email address 
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden access" })
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get("/payments/:transactionId", async (req, res) => {
      const { transactionId } = req.params;

      const result = await paymentCollection.findOne({
        transactionId,
      });

      if (!result) {
        return res.status(404).send({
          success: false,
          message: "Payment not found",
        });
      }

      res.send(result);
    });

    // ========================================
    // SSLCommerz Payment
    // ========================================

    app.post("/sslcommerz-payment", async (req, res) => {
      const paymentInfo = req.body;
      const tran_id = crypto.randomBytes(16).toString("hex");
      console.log(paymentInfo);

      const data = {
        total_amount: Number(paymentInfo.cost),
        currency: "BDT",
        tran_id,
        value_a: paymentInfo.parcelId,

        success_url: `${process.env.SERVER_DOMAIN}/payment/success/${tran_id}`,
        fail_url: `${process.env.SERVER_DOMAIN}/payment/fail`,
        cancel_url: `${process.env.SERVER_DOMAIN}/payment/cancelled`,
        ipn_url: `${process.env.SERVER_DOMAIN}/payment/ipn`,

        shipping_method: "Courier",
        product_name: paymentInfo.parcelName,
        product_category: "Courier",
        product_profile: "general",

        cus_name: paymentInfo.senderName,
        cus_email: paymentInfo.senderEmail,
        cus_add1: paymentInfo.senderAddress,
        cus_city: paymentInfo.senderDistrict,
        cus_state: paymentInfo.senderRegion,
        cus_postcode: paymentInfo.senderPostalCode,
        cus_country: "Bangladesh",
        cus_phone: paymentInfo.senderPhone,

        ship_name: paymentInfo.receiverName,
        ship_add1: paymentInfo.receiverAddress,
        ship_city: paymentInfo.receiverDistrict,
        ship_state: paymentInfo.receiverRegion,
        ship_postcode: paymentInfo.receiverPostalCode,
        ship_country: "Bangladesh",
      };

      console.log("TRANSACTION ID:", tran_id);
      console.log("SUCCESS URL:", data.success_url);

      const sslcz = new SSLCommerzPayment(
        store_id,
        store_passwd,
        is_live
      );

      const apiResponse = await sslcz.init(data);

      // console.log("SSL RESPONSE:", apiResponse);

      if (!apiResponse?.GatewayPageURL) {
        return res.status(400).send({
          success: false,
          message:
            apiResponse?.failedreason ||
            "SSLCOMMERZ payment initialization failed",
        });
      }

      res.send({
        success: true,
        url: apiResponse.GatewayPageURL,
        transactionId: tran_id,
      });
    });

    app.post("/payment/success/:tranId", async (req, res) => {
      const tranId = req.params.tranId;

      console.log("SSL Response:", req.body);

      const {
        tran_id,
        val_id,
        bank_tran_id,
        value_a,
      } = req.body;

      // -----------------------------
      // 1. Check transaction ID
      // -----------------------------
      if (!tran_id || tran_id !== tranId) {
        return res.status(400).send({
          success: false,
          message: "Transaction ID mismatch",
        });
      }

      // -----------------------------
      // 2. Check parcel ID
      // -----------------------------
      if (!value_a || !ObjectId.isValid(value_a)) {
        return res.status(400).send({
          success: false,
          message: "Invalid parcel ID",
        });
      }

      // -----------------------------
      // 3. Check validation ID
      // -----------------------------
      if (!val_id) {
        return res.status(400).send({
          success: false,
          message: "Validation ID missing",
        });
      }

      // -----------------------------
      // 4. Find parcel
      // -----------------------------
      const parcel = await parcelsCollection.findOne({
        _id: new ObjectId(value_a),
      });

      if (!parcel) {
        return res.status(404).send({
          success: false,
          message: "Parcel not found",
        });
      }

      // -----------------------------
      // 5. Validate payment
      // -----------------------------
      const sslcz = new SSLCommerzPayment(
        store_id,
        store_passwd,
        is_live
      );

      const validationResponse = await sslcz.validate({
        val_id,
      });

      console.log(
        "VALIDATION RESPONSE:",
        validationResponse
      );

      // -----------------------------
      // 6. Check validation
      // -----------------------------
      if (
        validationResponse.status !== "VALID" &&
        validationResponse.status !== "VALIDATED"
      ) {
        await parcelsCollection.updateOne(
          {
            _id: new ObjectId(value_a),
          },
          {
            $set: {
              paymentStatus: "failed",
            },
          }
        );

        return res.status(400).send({
          success: false,
          message: "Payment validation failed",
        });
      }

      // -----------------------------
      // 7. Check amount
      // -----------------------------
      const parcelAmount = Number(parcel.cost);
      const paidAmount = Number(validationResponse.amount);

      if (parcelAmount !== paidAmount) {
        return res.status(400).send({
          success: false,
          message: "Payment amount mismatch",
        });
      }

      // -----------------------------
      // 8. Check if already paid
      // -----------------------------
      const existingPayment =
        await paymentCollection.findOne({
          transactionId: tranId,
        });

      // -----------------------------
      // 9. Payment date
      // -----------------------------
      const paidAt = new Date();

      // -----------------------------
      // 10. Tracking ID
      // -----------------------------
      const trackingId = generateTrackingId();

      console.log("TRACKING ID:", trackingId);

      // -----------------------------
      // 11. Update parcel
      // -----------------------------
      const parcelUpdate =
        await parcelsCollection.updateOne(
          {
            _id: new ObjectId(value_a),
            paymentStatus: { $ne: "paid" },
          },
          {
            $set: {
              paymentStatus: "paid",

              paymentGateway: "sslcommerz",

              transactionId: tranId,

              trackingId: trackingId,

              sslValId: val_id,

              sslStatus: validationResponse.status,

              sslBankTranId: bank_tran_id,

              paidAmount: paidAmount,

              paidAt: paidAt,
            },
          }
        );
      console.log("PARCEL UPDATED:", parcelUpdate);

      // -----------------------------
      // 12. Insert payment
      // -----------------------------
      const paymentData = {
        parcelId: value_a,

        parcelName: parcel.parcelName,

        transactionId: tranId,

        trackingId: trackingId,

        customerEmail: parcel.senderEmail,

        amount: paidAmount,

        currency: "BDT",

        paymentMethod: "sslcommerz",

        paymentStatus: "paid",

        sslValId: val_id,

        sslStatus: validationResponse.status,

        sslBankTranId: bank_tran_id,

        paidAt: paidAt,
      };

      const paymentResult =
        await paymentCollection.insertOne(
          paymentData
        );

      console.log("PAYMENT INSERTED:", paymentResult);


      // -----------------------------
      // 13. Redirect React
      // -----------------------------
      res.redirect(
        `${process.env.SITE_DOMAIN}/dashboard/payment/success/${tranId}`
      );
    });

    app.post("/payment/ipn", async (req, res) => {
      try {
        console.log("========== IPN ==========");
        console.log(req.body);

        const {
          val_id,
          value_a,
          tran_id,
          bank_tran_id,
        } = req.body;

        // -----------------------------
        // 1. Check val_id
        // -----------------------------
        if (!val_id) {
          return res.status(400).send({
            message: "Validation ID missing",
          });
        }

        // -----------------------------
        // 2. Check parcel ID
        // -----------------------------
        if (!value_a || !ObjectId.isValid(value_a)) {
          return res.status(400).send({
            message: "Invalid parcel ID",
          });
        }

        // -----------------------------
        // 3. Find parcel
        // -----------------------------
        const parcel = await parcelsCollection.findOne({
          _id: new ObjectId(value_a),
        });

        if (!parcel) {
          return res.status(404).send({
            message: "Parcel not found",
          });
        }

        // -----------------------------
        // 4. Validate with SSLCommerz
        // -----------------------------
        const sslcz = new SSLCommerzPayment(
          store_id,
          store_passwd,
          is_live
        );

        const validationResponse =
          await sslcz.validate({
            val_id,
          });

        console.log(
          "IPN VALIDATION:",
          validationResponse
        );

        // -----------------------------
        // 5. Check validation
        // -----------------------------
        if (
          validationResponse.status !== "VALID" &&
          validationResponse.status !== "VALIDATED"
        ) {
          return res.status(400).send({
            message: "Payment validation failed",
          });
        }

        // -----------------------------
        // 6. Check amount
        // -----------------------------
        const parcelAmount = Number(parcel.cost);

        const paidAmount = Number(
          validationResponse.amount
        );

        if (parcelAmount !== paidAmount) {
          return res.status(400).send({
            message: "Payment amount mismatch",
          });
        }

        // -----------------------------
        // 7. Check existing payment
        // -----------------------------
        const existingPayment =
          await paymentCollection.findOne({
            transactionId: tran_id,
          });

        // -----------------------------
        // 8. Update parcel
        // -----------------------------
        await parcelsCollection.updateOne(
          {
            _id: new ObjectId(value_a),
          },
          {
            $set: {
              paymentStatus: "paid",

              paymentGateway: "sslcommerz",

              transactionId: tran_id,

              sslValId: val_id,

              sslStatus: validationResponse.status,

              sslBankTranId: bank_tran_id,

              paidAmount: paidAmount,

              paidAt: new Date(),
            },
          }
        );

        console.log("PARCEL UPDATED FROM IPN");

        // -----------------------------
        // 9. Insert payment
        // -----------------------------
        if (!existingPayment) {
          const paymentData = {
            parcelId: value_a,

            transactionId: tran_id,

            amount: paidAmount,

            currency: "BDT",

            paymentMethod: "sslcommerz",

            paymentStatus: "paid",

            sslValId: val_id,

            sslStatus: validationResponse.status,

            sslBankTranId: bank_tran_id,

            paidAt: new Date(),
          };

          await paymentCollection.insertOne(
            paymentData
          );

          console.log(
            "PAYMENT INSERTED FROM IPN"
          );
        } else {
          console.log(
            "PAYMENT ALREADY EXISTS"
          );
        }

        // -----------------------------
        // 10. Response
        // -----------------------------
        res.status(200).send(
          "IPN processed successfully"
        );
      } catch (error) {
        console.error(
          "IPN ERROR:",
          error
        );

        res.status(500).send({
          message: "IPN processing failed",
        });
      }
    });

    app.post("/payment/fail", async (req, res) => {

      console.log(
        "PAYMENT FAILED:",
        req.body
      );

      res.redirect(
        `${process.env.SITE_DOMAIN}/dashboard/payment/cancelled`
      );

    });

    // ========================================
    // Stripe Payment
    // ========================================

    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        adaptive_pricing: {
          enabled: false,
        },

        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: 'USD',
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName
              }
            },

            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({ url: session.url })
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("session retrieve", session);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentCollection.findOne(query);

      if (paymentExist) {
        return res.send({
          message: "already exists",
          transactionId,
          trackingId: paymentExist.trackingId
        })
      }

      const trackingId = generateTrackingId();

      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            trackingId: trackingId

          }
        }
        const result = await parcelsCollection.updateOne(query, update);
        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId
        }

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          return res.send({
            success: true,
            modifyParcel: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment
          })
        }
      }

      return res.send({ success: false })
    })

    // ========================================
    // Riders APIs
    // ========================================

    app.get("/riders", async (req, res) => {
      const query = {};
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = ridersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })

    app.post("/riders", async (req, res) => {
      const rider = {
        ...req.body,
        status: "pending",
        createdAt: new Date(),
      };

      const result = await ridersCollection.insertOne(rider);
      console.log(result);

      res.send(result);
    })

    app.patch("/riders/:id", verifyFBToken, async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: status
        }
      }

      const result = await ridersCollection.updateOne(query, updatedDoc);
      if (status === "approved") {
        const email = req.body.email;
        const userQuery = { email }
        const updateUser = {
          $set: {
            role: "rider"
          }
        }
        const userResult = await userCollection.updateOne(userQuery, updateUser);
      }
      res.send(result);
    })



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
//   } finally {
//     // Ensures that the client will close when you finish/error
//     // await client.close();
//   }
// }

// run().catch(console.dir);

// ========================================
// Root Route
// ========================================

app.get("/", (req, res) => {
  res.send("move nest server is working");
});

// ========================================
// Start Server
// ========================================
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

module.exports = app;