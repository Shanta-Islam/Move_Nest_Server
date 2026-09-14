const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;
const { ObjectId } = require("mongodb");
const SSLCommerzPayment = require('sslcommerz-lts')
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false

const crypto = require("crypto");

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



//middleware
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true}))

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.onvejqf.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("moveNestDB");
    const parcelsCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments")

    ////parcel api
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


    ////payment related api
    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      const cursor = paymentCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })

    //payment related api--sslcommerz
    // app.post("/sslcommerz/init", async (req, res) => {
    //   const paymentInfo = req.body;

    //   const data = {
    //     total_amount: Number(paymentInfo.cost),
    //     currency: 'BDT',
    //     tran_id: tran_id, // use unique tran_id for each api call
    //     success_url: `${process.env.SITE_DOMAIN}/dashboard/payment/success/${tran_id}`,
    //     fail_url: `${process.env.SITE_DOMAIN}/fail`,
    //     cancel_url: `${process.env.SITE_DOMAIN}/cancel`,
    //     ipn_url: `${process.env.SITE_DOMAIN}/ipn`,
    //     shipping_method: 'Courier',
    //     product_name: paymentInfo.parcelName,
    //     product_category: "Courier",
    //     product_profile: "general",

    //     cus_name: paymentInfo.senderName,
    //     cus_email: paymentInfo.senderEmail,
    //     cus_add1: paymentInfo.senderAddress,
    //     cus_city: paymentInfo.senderDistrict,
    //     cus_state: paymentInfo.senderRegion,
    //     cus_postcode: "1000",
    //     cus_country: 'Bangladesh',
    //     cus_phone: paymentInfo.senderPhone,

    //     ship_name: paymentInfo.receiverName,
    //     ship_add1: paymentInfo.receiverAddress,
    //     ship_city: paymentInfo.receiverDistrict,
    //     ship_state: paymentInfo.receiverRegion,
    //     ship_postcode: "1000",
    //     ship_country: 'Bangladesh',
    //   };

    //   console.log("TRANSACTION ID:", tran_id);
    //   console.log("SUCCESS URL:", data.success_url);
    //   // console.log("data", data);
    //   const sslcz = new SSLCommerzPayment(
    //     store_id,
    //     store_passwd,
    //     is_live
    //   );
    //   const apiResponse = await sslcz.init(data);

    //   // console.log("SSLCommerz response:", apiResponse);

    //   res.send({
    //     success: true,
    //     url: apiResponse.GatewayPageURL,
    //     transactionId: data.tran_id,
    //   });







    // })

    app.post("/sslcommerz-payment", async (req, res) => {
      const paymentInfo = req.body;

      const tran_id = crypto.randomBytes(16).toString("hex");

      const data = {
        total_amount: Number(paymentInfo.cost),
        currency: "BDT",
        tran_id,

        success_url: `${process.env.SERVER_DOMAIN}/payment/success/${tran_id}`,
        fail_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        ipn_url: `${process.env.SITE_DOMAIN}/payment/ipn`,

        shipping_method: "Courier",
        product_name: paymentInfo.parcelName,
        product_category: "Courier",
        product_profile: "general",

        cus_name: paymentInfo.senderName,
        cus_email: paymentInfo.senderEmail,
        cus_add1: paymentInfo.senderAddress,
        cus_city: paymentInfo.senderDistrict,
        cus_state: paymentInfo.senderRegion,
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: paymentInfo.senderPhone,

        ship_name: paymentInfo.receiverName,
        ship_add1: paymentInfo.receiverAddress,
        ship_city: paymentInfo.receiverDistrict,
        ship_state: paymentInfo.receiverRegion,
        ship_postcode: "1000",
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

      console.log("SSL RESPONSE:", apiResponse);

      res.send({
        success: true,
        url: apiResponse.GatewayPageURL,
        transactionId: tran_id,
      });
    });

    // app.post("/payment/success/:tranId", async (req, res) => {
    //   const tranId = req.params.tranId;

    //   console.log("Payment Successful");
    //   console.log("TransactionId", tranId);

    //   res.redirect(
    //     `${process.env.SITE_DOMAIN}/dashboard/payment/success/${tranId}`
    //   );
    // });

    app.post("/payment/success/:tranId", async (req, res) => {
      try {
        const tranId = req.params.tranId;
        console.log({sslData: req.body});
        
        // const val_id = req.body.val_id;

        console.log("SSLCommerz payment successful");
        console.log("Transaction ID:", tranId);

        const sslcz = new SSLCommerzPayment(
          store_id,
          store_passwd,
          is_live
        );

        // sslcz.validate(data).then(data => {
        //   //process the response that got from sslcommerz 
        //   // https://developer.sslcommerz.com/doc/v4/#order-validation-api
        // });

        res.redirect(
          `${process.env.SITE_DOMAIN}/dashboard/payment/success/${tranId}`
        );
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Something went wrong",
        });
      }
    });


    app.patch("/payment/success/:tranId", async (req, res) => {
      const tranId = req.params.tranId;

      console.log("SSL transaction:", tranId);

      // Find payment
      // Verify SSLCommerz
      // Update payment
      // Update parcel

      res.send({
        transactionId: tranId,
        trackingId: "YOUR_TRACKING_ID",
      });
    });




    //payment related api--Stripe
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

    //payment success
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log("session retrieve", session);

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
          res.send({
            success: true,
            modifyParcel: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment
          })
        }
      }

      res.send({ success: false })
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("move nest server is working");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
