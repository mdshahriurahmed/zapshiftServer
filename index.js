const express = require('express')
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const crypto = require("crypto");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@dedzeqe.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

function generateTrackingId() {
    const prefix = "PRCL";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();

    return `${prefix}-${date}-${random}`;
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect();

        const db = client.db('zap_shift_db');
        const userCollection = db.collection('users');
        const parcelsCollection = db.collection('parcels');
        const paymentCollection = db.collection('payments');
        const ridersCollection = db.collection('riders');
        const trackingsCollection = db.collection('trackings');
        console.log("You successfully connected to MongoDB!");
        // TRACKING FUNCTION
        // =========================

        const logTracking = async (trackingId, status) => {
            const log = {
                trackingId,
                status,
                details: status.split('_').join(' '),
                createdAt: new Date()
            };

            return await trackingsCollection.insertOne(log);
        };

        // =========================
        // USERS
        // =========================

        app.get('/users', async (req, res) => {
            try {
                const searchText = req.query.searchText;

                const query = {};

                if (searchText) {
                    query.$or = [
                        {
                            displayName: {
                                $regex: searchText,
                                $options: 'i'
                            }
                        },
                        {
                            email: {
                                $regex: searchText,
                                $options: 'i'
                            }
                        }
                    ];
                }

                const cursor = userCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .limit(5);

                const result = await cursor.toArray();

                res.send(result);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to get users'
                });
            }
        });


        app.get('/users/:id', async (req, res) => {
            try {
                const id = req.params.id;

                const query = {
                    _id: new ObjectId(id)
                };

                const user = await userCollection.findOne(query);

                res.send(user);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to get user'
                });
            }
        });


        // Get user role
        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;

                const user = await userCollection.findOne({
                    email: email
                });

                res.send({
                    role: user?.role || 'user'
                });

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to get user role'
                });
            }
        });


        // Create user
        app.post('/users', async (req, res) => {
            try {
                const user = req.body;

                user.role = 'user';
                user.createdAt = new Date();

                const email = user.email;

                const userExists = await userCollection.findOne({
                    email: email
                });

                if (userExists) {
                    return res.send({
                        message: 'user exists'
                    });
                }

                const result = await userCollection.insertOne(user);

                res.send(result);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to create user'
                });
            }
        });


        // Update user role
        app.patch('/users/:id/role', async (req, res) => {
            try {
                const id = req.params.id;

                const roleInfo = req.body;

                const query = {
                    _id: new ObjectId(id)
                };

                const updatedDoc = {
                    $set: {
                        role: roleInfo.role
                    }
                };

                const result = await userCollection.updateOne(
                    query,
                    updatedDoc
                );

                res.send(result);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to update user role'
                });
            }
        });


        // =========================
        // PARCEL API
        // =========================

        app.get('/parcels', async (req, res) => {
            try {
                const query = {};

                const {
                    email,
                    deliveryStatus
                } = req.query;


                if (email) {
                    query.senderEmail = email;
                }


                if (deliveryStatus) {
                    query.deliveryStatus = deliveryStatus;
                }


                const options = {
                    sort: {
                        createdAt: -1
                    }
                };


                const cursor = parcelsCollection.find(
                    query,
                    options
                );

                const result = await cursor.toArray();

                res.send(result);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to get parcels'
                });
            }
        });


        // Rider parcels
        app.get('/parcels/rider', async (req, res) => {
            try {
                const {
                    deliveryStatus,
                    email
                } = req.query;

                const query = {};


                if (email) {
                    query.riderEmail = email;
                }


                if (deliveryStatus !== 'parcel_delivered') {
                    query.deliveryStatus = {
                        $nin: ['parcel_delivered']
                    };
                } else {
                    query.deliveryStatus = deliveryStatus;
                }


                const cursor = parcelsCollection.find(query);

                const result = await cursor.toArray();

                res.send(result);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to get rider parcels'
                });
            }
        });


        // Get single parcel
        app.get('/parcels/:id', async (req, res) => {
            try {
                const id = req.params.id;

                const query = {
                    _id: new ObjectId(id)
                };

                const parcel = await parcelsCollection.findOne(query);


                if (!parcel) {
                    return res.status(404).send({
                        message: 'parcel not found'
                    });
                }


                res.send(parcel);

            } catch (err) {
                console.error(err);

                res.status(500).send({
                    message: 'Failed to get parcel'
                });
            }
        });


        // Delivery status statistics
        app.get(
            '/parcels/delivery-status/stats',
            async (req, res) => {

                try {

                    const pipeline = [
                        {
                            $group: {
                                _id: '$deliveryStatus',
                                count: {
                                    $sum: 1
                                }
                            }
                        },

                        {
                            $project: {
                                status: '$_id',
                                count: 1
                            }
                        }
                    ];


                    const result =
                        await parcelsCollection
                            .aggregate(pipeline)
                            .toArray();


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({
                        message:
                            'Failed to get delivery statistics'
                    });
                }
            }
        );


        // Create parcel
        app.post('/parcels', async (req, res) => {
            try {

                const parcel = req.body;

                const trackingId =
                    generateTrackingId();


                parcel.createdAt = new Date();

                parcel.trackingId =
                    trackingId;


                // Authentication disabled.
                // senderEmail comes from request body.
                if (!parcel.senderEmail) {

                    return res.status(400).send({
                        message:
                            'senderEmail is required'
                    });
                }


                await logTracking(
                    trackingId,
                    'parcel_created'
                );


                const result =
                    await parcelsCollection
                        .insertOne(parcel);


                res.send(result);

            } catch (err) {

                console.error(err);

                res.status(500).send({
                    message:
                        'Failed to create parcel'
                });
            }
        });


        // Update parcel delivery status
        app.patch(
            '/parcels/:id/status',
            async (req, res) => {

                try {

                    const {
                        deliveryStatus,
                        riderId,
                        trackingId
                    } = req.body;

                    const id = req.params.id;


                    const query = {
                        _id: new ObjectId(id)
                    };


                    const parcel =
                        await parcelsCollection
                            .findOne(query);


                    if (!parcel) {

                        return res.status(404).send({
                            message:
                                'parcel not found'
                        });
                    }


                    const updatedDoc = {
                        $set: {
                            deliveryStatus:
                                deliveryStatus
                        }
                    };


                    // If delivered, make rider available
                    if (
                        deliveryStatus ===
                        'parcel_delivered' &&
                        riderId
                    ) {

                        const riderQuery = {
                            _id:
                                new ObjectId(riderId)
                        };


                        const riderUpdatedDoc = {
                            $set: {
                                workStatus:
                                    'available'
                            }
                        };


                        await ridersCollection
                            .updateOne(
                                riderQuery,
                                riderUpdatedDoc
                            );
                    }


                    const result =
                        await parcelsCollection
                            .updateOne(
                                query,
                                updatedDoc
                            );


                    if (trackingId) {

                        await logTracking(
                            trackingId,
                            deliveryStatus
                        );
                    }


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({
                        message:
                            'Failed to update parcel status'
                    });
                }
            }
        );


        // Assign rider to parcel
        app.patch(
            '/parcels/:id',
            async (req, res) => {

                try {

                    const {
                        riderId,
                        riderName,
                        riderEmail,
                        trackingId
                    } = req.body;


                    const id = req.params.id;


                    const query = {
                        _id:
                            new ObjectId(id)
                    };


                    const updatedDoc = {
                        $set: {
                            deliveryStatus:
                                'driver_assigned',

                            riderId:
                                riderId,

                            riderName:
                                riderName,

                            riderEmail:
                                riderEmail
                        }
                    };


                    const result =
                        await parcelsCollection
                            .updateOne(
                                query,
                                updatedDoc
                            );


                    // Update rider work status
                    if (riderId) {

                        const riderQuery = {
                            _id:
                                new ObjectId(riderId)
                        };


                        const riderUpdatedDoc = {
                            $set: {
                                workStatus:
                                    'in_delivery'
                            }
                        };


                        await ridersCollection
                            .updateOne(
                                riderQuery,
                                riderUpdatedDoc
                            );
                    }


                    if (trackingId) {

                        await logTracking(
                            trackingId,
                            'driver_assigned'
                        );
                    }


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({
                        message:
                            'Failed to assign rider'
                    });
                }
            }
        );


        // Delete parcel
        app.delete(
            '/parcels/:id',
            async (req, res) => {

                try {

                    const id =
                        req.params.id;


                    const query = {
                        _id:
                            new ObjectId(id)
                    };


                    const result =
                        await parcelsCollection
                            .deleteOne(query);


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({
                        message:
                            'Failed to delete parcel'
                    });
                }
            }
        );


        // =========================
        // PAYMENT API
        // =========================

        app.post(
            '/payment-checkout-session',
            async (req, res) => {

                const parcelInfo =
                    req.body;

                const amount =
                    parseInt(parcelInfo.cost) * 100;

                const successUrl =
                    'http://localhost:5173/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}';

                const cancelUrl =
                    'http://localhost:5173/dashboard/payment-cancelled';

                console.log('SUCCESS URL:', successUrl);
                console.log('CANCEL URL:', cancelUrl);
                const session =
                    await stripe
                        .checkout
                        .sessions
                        .create({

                            line_items: [
                                {
                                    price_data: {

                                        currency: 'usd',

                                        unit_amount:
                                            amount,

                                        product_data: {

                                            name:
                                                `Please pay for: ${parcelInfo.parcelName}`
                                        }
                                    },

                                    quantity: 1
                                }
                            ],

                            mode: 'payment',

                            metadata: {

                                parcelId:
                                    parcelInfo.parcelId,

                                trackingId:
                                    parcelInfo.trackingId
                            },

                            customer_email:
                                parcelInfo.senderEmail,

                            success_url: successUrl,
                            cancel_url: cancelUrl
                        });


                res.send({
                    url:
                        session.url
                });
            }
        );


        // Payment success
        app.patch(
            '/payment-success',
            async (req, res) => {

                try {

                    const sessionId =
                        req.query.session_id;


                    const session =
                        await stripe
                            .checkout
                            .sessions
                            .retrieve(
                                sessionId
                            );


                    const transactionId =
                        session.payment_intent;


                    const query = {
                        transactionId:
                            transactionId
                    };


                    const paymentExist =
                        await paymentCollection
                            .findOne(query);


                    if (paymentExist) {

                        return res.send({

                            message:
                                'already exists',

                            transactionId,

                            trackingId:
                                paymentExist
                                    .trackingId
                        });
                    }


                    const trackingId =
                        session
                            .metadata
                            .trackingId;


                    if (
                        session.payment_status
                        === 'paid'
                    ) {

                        const id =
                            session
                                .metadata
                                .parcelId;


                        const parcelQuery = {
                            _id:
                                new ObjectId(id)
                        };


                        const update = {
                            $set: {

                                paymentStatus:
                                    'paid',

                                deliveryStatus:
                                    'pending-pickup'
                            }
                        };


                        const result =
                            await parcelsCollection
                                .updateOne(
                                    parcelQuery,
                                    update
                                );


                        const payment = {

                            amount:
                                session.amount_total
                                / 100,

                            currency:
                                session.currency,

                            customerEmail:
                                session.customer_email,

                            parcelId:
                                session.metadata
                                    .parcelId,

                            parcelName:
                                session.metadata
                                    .parcelName,

                            transactionId:
                                session.payment_intent,

                            paymentStatus:
                                session.payment_status,

                            paidAt:
                                new Date(),

                            trackingId:
                                trackingId
                        };


                        const resultPayment =
                            await paymentCollection
                                .insertOne(
                                    payment
                                );


                        await logTracking(
                            trackingId,
                            'parcel_paid'
                        );


                        return res.send({

                            success:
                                true,

                            modifyParcel:
                                result,

                            trackingId:
                                trackingId,

                            transactionId:
                                session.payment_intent,

                            paymentInfo:
                                resultPayment
                        });
                    }


                    return res.send({
                        success:
                            false
                    });

                } catch (err) {
                    console.error('STRIPE ERROR:', err);
                    console.error('STRIPE MESSAGE:', err.message);
                    console.error('STRIPE RAW MESSAGE:', err.raw?.message);

                    res.status(400).send({
                        message: err.message,
                        stripeMessage: err.raw?.message
                    });
                }
            }
        );


        // Get payments
        app.get('/payments', async (req, res) => {

            try {

                const email =
                    req.query.email;

                const query = {};


                if (email) {

                    query.customerEmail =
                        email;
                }


                const cursor =
                    paymentCollection
                        .find(query)
                        .sort({
                            paidAt: -1
                        });


                const result =
                    await cursor
                        .toArray();


                res.send(result);

            } catch (err) {

                console.error(err);

                res.status(500).send({
                    message:
                        'Failed to get payments'
                });
            }
        });


        // =========================
        // RIDERS
        // =========================

        app.get('/riders', async (req, res) => {

            try {

                const {
                    status,
                    district,
                    workStatus
                } = req.query;


                const query = {};


                if (status) {

                    query.status =
                        status;
                }


                if (district) {

                    query.district =
                        district;
                }


                if (workStatus) {

                    query.workStatus =
                        workStatus;
                }


                const cursor =
                    ridersCollection
                        .find(query);


                const result =
                    await cursor
                        .toArray();


                res.send(result);

            } catch (err) {

                console.error(err);

                res.status(500).send({
                    message:
                        'Failed to get riders'
                });
            }
        });


        // Rider delivery statistics
        app.get(
            '/riders/delivery-per-day',
            async (req, res) => {

                try {

                    const email =
                        req.query.email;


                    const match = {

                        deliveryStatus:
                            "parcel_delivered"
                    };


                    if (email) {

                        match.riderEmail =
                            email;
                    }


                    const pipeline = [

                        {
                            $match:
                                match
                        },

                        {
                            $lookup: {

                                from:
                                    "trackings",

                                localField:
                                    "trackingId",

                                foreignField:
                                    "trackingId",

                                as:
                                    "parcel_trackings"
                            }
                        },

                        {
                            $unwind:
                                "$parcel_trackings"
                        },

                        {
                            $match: {

                                "parcel_trackings.status":
                                    "parcel_delivered"
                            }
                        },

                        {
                            $addFields: {

                                deliveryDay: {

                                    $dateToString: {

                                        format:
                                            "%Y-%m-%d",

                                        date:
                                            "$parcel_trackings.createdAt"
                                    }
                                }
                            }
                        },

                        {
                            $group: {

                                _id:
                                    "$deliveryDay",

                                deliveredCount: {

                                    $sum: 1
                                }
                            }
                        }
                    ];


                    const result =
                        await parcelsCollection
                            .aggregate(
                                pipeline
                            )
                            .toArray();


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({
                        message:
                            'Failed to get rider delivery stats'
                    });
                }
            }
        );


        // Create rider
        app.post('/riders', async (req, res) => {

            try {

                const rider =
                    req.body;


                rider.status =
                    'pending';

                rider.createdAt =
                    new Date();


                const result =
                    await ridersCollection
                        .insertOne(rider);


                res.send(result);

            } catch (err) {

                console.error(err);

                res.status(500).send({
                    message:
                        'Failed to create rider'
                });
            }
        });


        // Update rider
        app.patch(
            '/riders/:id',
            async (req, res) => {

                try {

                    const status =
                        req.body.status;

                    const id =
                        req.params.id;


                    const query = {

                        _id:
                            new ObjectId(id)
                    };


                    const updatedDoc = {

                        $set: {

                            status:
                                status,

                            workStatus:
                                'available'
                        }
                    };


                    const result =
                        await ridersCollection
                            .updateOne(
                                query,
                                updatedDoc
                            );


                    // Approved rider becomes rider role
                    if (
                        status ===
                        'approved'
                    ) {

                        const email =
                            req.body.email;


                        const userQuery = {
                            email:
                                email
                        };


                        const updateUser = {

                            $set: {

                                role:
                                    'rider'
                            }
                        };


                        await userCollection
                            .updateOne(
                                userQuery,
                                updateUser
                            );
                    }


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({
                        message:
                            'Failed to update rider'
                    });
                }
            }
        );


        // =========================
        // TRACKING
        // =========================

        app.get(
            '/trackings/:trackingId/logs',
            async (req, res) => {

                try {

                    const trackingId =
                        req.params.trackingId;


                    const parcel =
                        await parcelsCollection
                            .findOne({
                                trackingId:
                                    trackingId
                            });


                    if (!parcel) {

                        return res.status(404).send({

                            message:
                                'tracking not found'
                        });
                    }


                    const query = {

                        trackingId:
                            trackingId
                    };


                    const result =
                        await trackingsCollection
                            .find(query)
                            .toArray();


                    res.send(result);

                } catch (err) {

                    console.error(err);

                    res.status(500).send({

                        message:
                            'Failed to get tracking logs'
                    });
                }
            }
        );

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}


run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('zap is shifting shifting!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

