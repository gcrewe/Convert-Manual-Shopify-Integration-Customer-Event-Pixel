purchase_goalid = '100136097';
addToCart_goalid = '100134910';
checkoutStarted_goalid = '100132287';

function postTransaction(convert_attributes_str, purchase_event, purchase_goalid) {
    console.log("Starting postTransaction function.");

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes && purchase_event) {
            console.log("Building POST data for transaction.");

            // Start with the original transaction amount
            let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);

        // Filters out transaction not within the Project Settings Thresholds  
        if (transactionAmount => convert_attributes.min_order_value && transactionAmount <= convert_attributes.max_order_value){

            // Apply conversion rate if it exists and is not one
            if (convert_attributes.conversion_rate && convert_attributes.conversion_rate !== 1) {
                transactionAmount *= convert_attributes.conversion_rate;
                console.log(`Transaction amount adjusted by conversion rate (${convert_attributes.conversion_rate}): ${transactionAmount}`);
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
                    'r': transactionAmount,  // Use the possibly adjusted amount
                    'prc': purchase_event.data.checkout.lineItems.length
                }]
            };
            const data = JSON.stringify(post);
            const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;
            const beaconResult = browser.sendBeacon(beaconUrl, data);
            console.log("sendBeacon result:", beaconResult);
            console.log("transactionID: "+transactionId);
            console.dir("purchase_event: "+JSON.stringify(purchase_event.data));
        }
        } else {
            console.error("Invalid or missing convert_attributes or purchase_event.");
        }
    } catch (error) {
        console.error('Error in postTransaction:', error);
    }
}


function postConversion(convert_attributes_str, goalid) {
    console.log('Convert: Starting postConversion function with goal id:', goalid);

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes) {
            console.log("Building POST data for goal hit.");
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
            const data = JSON.stringify(post);
            const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;
            const beaconResult = browser.sendBeacon(beaconUrl, data);
            console.log("sendBeacon result:", beaconResult);
        } else {
            console.error("Invalid or missing convert_attributes or purchase_event.");
        }
    } catch (error) {
        console.error('Error in postTransaction:', error);
    }
}

analytics.subscribe("checkout_completed", async (event) => {
    console.log("Event received for checkout_completed.");

    browser.localStorage.getItem('convert_attributes')
        .then((result) => {
            postConversion(result, purchase_goalid);
            return result;
        })
        .then((originalResult) => {
            return postTransaction(originalResult, event, purchase_goalid);
        })
        .catch((error) => {
            console.error('Error in checkout_completed promise chain:', error);
        });
});

analytics.subscribe("product_added_to_cart", async (event) => {
    console.log("Event received for product_added_to_cart.");

    browser.localStorage.getItem('convert_attributes')
        .then((result) => {
            return postConversion(result, addToCart_goalid);
        })
        .catch((error) => {
            console.error('Error retrieving convert_attributes for product_added_to_cart:', error);
        });
});

analytics.subscribe("checkout_started", async (event) => {
    console.log("Event received for checkout_started.");

    browser.localStorage.getItem('convert_attributes')
        .then((result) => {
            return postConversion(result, checkoutStarted_goalid);
        })
        .catch((error) => {
            console.error('Error retrieving convert_attributes for checkout_started:', error);
        });
});
