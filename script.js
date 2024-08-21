purchase_goalid = '100136097';
addToCart_goalid = '100134910';
checkoutStarted_goalid = '100132287';

function isValidJSON(data) {
    try {
        JSON.parse(data);
    } catch (e) {
        return false;
    }
    return true;
}

async function postTransaction(convert_attributes_str, purchase_event, purchase_goalid) {
    console.log("Convert Shopify Integration: Starting postTransaction function.");

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes && purchase_event) {
            console.log("Convert Shopify Integration: Building POST data for transaction.");

            let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);

            if (transactionAmount >= convert_attributes.min_order_value && transactionAmount <= convert_attributes.max_order_value){

                if (convert_attributes.conversion_rate && convert_attributes.conversion_rate !== 1) {
                    transactionAmount *= convert_attributes.conversion_rate;
                    console.log(`Convert Shopify Integration: Transaction amount adjusted by conversion rate (${convert_attributes.conversion_rate}): ${transactionAmount}`);
                }

                const transactionId = purchase_event.data.checkout.order.id;

                const post = {
                    'cid': convert_attributes.cid,
                    'pid': convert_attributes.pid,
                    'seg': convert_attributes.defaultSegments,
                    's': 'shopify',
                    'vid': convert_attributes.vid,
                    'tid': transactionId,
                    'ev': [{
                        'evt': 'tr',
                        'goals': [purchase_goalid],
                        'exps': convert_attributes.exps,
                        'vars': convert_attributes.vars,
                        'r': transactionAmount,
                        'prc': purchase_event.data.checkout.lineItems.length
                    }]
                };
                let data = JSON.stringify(post);

                // Verify and fix JSON if necessary
                if (!isValidJSON(data)) {
                    data = JSON.stringify(JSON.parse(data));
                }

                const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;

                const response = await fetch(beaconUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: data
                });

                if (!response.ok) {
                    throw new Error('Convert Shopify Integration: Network response was not ok');
                }

                const result = await response.json();
                console.log("Convert Shopify Integration: fetch result:", result);
                console.log("Convert Shopify Integration: transactionID: " + transactionId);
                console.dir("Convert Shopify Integration: purchase_event: " + JSON.stringify(purchase_event.data));
            }
        } else {
            console.error("Convert Shopify Integration: Invalid or missing convert_attributes or purchase_event.");
        }
    } catch (error) {
        console.error('Convert Shopify Integration: Error in postTransaction:', error);
    }
}

async function postConversion(convert_attributes_str, goalid) {
    console.log('Convert Shopify Integration: Starting postConversion function with goal id:', goalid);

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes) {
            console.log("Convert Shopify Integration: Building POST data for goal hit.");
            const post = {
                'cid': convert_attributes.cid,
                'pid': convert_attributes.pid,
                'seg': convert_attributes.defaultSegments,
                's': 'shopify',
                'vid': convert_attributes.vid,
                'ev': [{
                    'evt': 'hitGoal',
                    'goals': [goalid],
                    'exps': convert_attributes.exps,
                    'vars': convert_attributes.vars
                }]
            };
            let data = JSON.stringify(post);

            // Verify and fix JSON if necessary
            if (!isValidJSON(data)) {
                data = JSON.stringify(JSON.parse(data));
            }

            const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;

            const response = await fetch(beaconUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: data
            });

            if (!response.ok) {
                throw new Error('Convert Shopify Integration: Network response was not ok');
            }

            const result = await response.json();
            console.log("Convert Shopify Integration: fetch result:", result);
        } else {
            console.error("Convert Shopify Integration: Invalid or missing convert_attributes or purchase_event.");
        }
    } catch (error) {
        console.error('Convert Shopify Integration: Error in postConversion:', error);
    }
}

analytics.subscribe("checkout_completed", async (event) => {
    console.log("Convert Shopify Integration: Event received for checkout_completed.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, purchase_goalid);
        await postTransaction(result, event, purchase_goalid);
    } catch (error) {
        console.error('Convert Shopify Integration: Error in checkout_completed promise chain:', error);
    }
});

analytics.subscribe("product_added_to_cart", async (event) => {
    console.log("Convert Shopify Integration: Event received for product_added_to_cart.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, addToCart_goalid);
    } catch (error) {
        console.error('Convert Shopify Integration: Error retrieving convert_attributes for product_added_to_cart:', error);
    }
});

analytics.subscribe("checkout_started", async (event) => {
    console.log("Convert Shopify Integration: Event received for checkout_started.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, checkoutStarted_goalid);
    } catch (error) {
        console.error('Convert Shopify Integration: Error retrieving convert_attributes for checkout_started:', error);
    }
});