const DEBUG = true; // Set to false to disable debug logs

const purchase_goalid = '100136097';
const addToCart_goalid = '100134910';
const checkoutStarted_goalid = '100132287';

// Configuration object for filtering criteria
const filterCriteria = {
    checkExistence: ['data.sku'],
    matchValue: {
        'data.sku': /part_of_sku_value/
    }
};

function isValidJSON(data) {
    try {
        JSON.parse(data);
    } catch (e) {
        return false;
    }
    return true;
}

function debugLog(message, ...optionalParams) {
    if (DEBUG) {
        console.log('Convert Shopify Integration:', message, ...optionalParams);
    }
}

function checkCriteria(purchase_event, criteria) {
    // Check for the existence of properties
    for (const prop of criteria.checkExistence) {
        const value = prop.split('.').reduce((obj, key) => obj && obj[key], purchase_event);
        if (value === undefined) {
            debugLog(`Property ${prop} does not exist.`);
            return false;
        }
    }

    // Check for matching value patterns
    for (const [prop, regex] of Object.entries(criteria.matchValue)) {
        const value = prop.split('.').reduce((obj, key) => obj && obj[key], purchase_event);
        if (value === undefined || !regex.test(value)) {
            debugLog(`Property ${prop} does not match pattern ${regex}. Value: ${value}`);
            return false;
        }
    }

    return true;
}

async function postTransaction(convert_attributes_str, purchase_event, purchase_goalid) {
    debugLog("Starting postTransaction function.");

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes && purchase_event) {
            // Apply the filtering criteria
            if (!checkCriteria(purchase_event, filterCriteria)) {
                debugLog("Transaction filtered out based on criteria:", filterCriteria);
                return;
            }

            debugLog("Building POST data for transaction.");

            let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);

            if (transactionAmount >= convert_attributes.min_order_value && transactionAmount <= convert_attributes.max_order_value) {

                if (convert_attributes.conversion_rate && convert_attributes.conversion_rate !== 1) {
                    transactionAmount *= convert_attributes.conversion_rate;
                    debugLog(`Transaction amount adjusted by conversion rate (${convert_attributes.conversion_rate}): ${transactionAmount}`);
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

                try {
                    const response = await fetch(beaconUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: data
                    });

                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }

                    const result = await response.json();
                    debugLog("fetch result:", result);
                    debugLog("transactionID: " + transactionId);
                    debugLog("purchase_event: " + JSON.stringify(purchase_event.data));
                } catch (fetchError) {
                    console.error('Error in fetch request:', fetchError);
                }
            } else {
                debugLog("Transaction amount filtered out. Amount:", transactionAmount);
            }
        } else {
            console.error("Invalid or missing convert_attributes or purchase_event.");
        }
    } catch (parseError) {
        console.error('Error parsing JSON in postTransaction:', parseError);
    }
}

async function postConversion(convert_attributes_str, goalid) {
    debugLog('Starting postConversion function with goal id:', goalid);

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes) {
            debugLog("Building POST data for goal hit.");
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

            try {
                const response = await fetch(beaconUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: data
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const result = await response.json();
                debugLog("fetch result:", result);
            } catch (fetchError) {
                console.error('Error in fetch request:', fetchError);
            }
        } else {
            console.error("Invalid or missing convert_attributes.");
        }
    } catch (parseError) {
        console.error('Error parsing JSON in postConversion:', parseError);
    }
}

analytics.subscribe("checkout_completed", async (event) => {
    debugLog("Event received for checkout_completed.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, purchase_goalid);
        await postTransaction(result, event, purchase_goalid);
    } catch (error) {
        console.error('Error in checkout_completed promise chain:', error);
    }
});

analytics.subscribe("product_added_to_cart", async (event) => {
    debugLog("Event received for product_added_to_cart.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, addToCart_goalid);
    } catch (error) {
        console.error('Error retrieving convert_attributes for product_added_to_cart:', error);
    }
});

analytics.subscribe("checkout_started", async (event) => {
    debugLog("Event received for checkout_started.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, checkoutStarted_goalid);
    } catch (error) {
        console.error('Error retrieving convert_attributes for checkout_started:', error);
    }
});