const DEBUG = true; // Set to false to disable debug logs
const ENABLE_PROPERTY_FILTERING = true; // Set to false to disable property filtering

const total_purchases_goalid = '100136097';
const firstSale_goalid = 'firstSale_goal_id'; // Replace with the actual goal ID for first sale
const upsell_goalid = 'upsell_goal_id'; // Replace with the actual goal ID for upsells

// Configuration object for filtering criteria
const filterCriteria = {
    enabled: false, // Enable or disable criteria checking
    checkExistence: ['sku'], // List of properties that must exist
    matchValue: {
        'sku': '23026961-pink-united-states-l-diameter-7-5cm' // Exact string values to match
    },
    checkValue: false // Enable or disable value matching
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

// Helper function to search for a property name anywhere in the object
function findProperty(obj, propertyName) {
    if (obj === undefined || obj === null) {
        return undefined;
    }
    if (obj.hasOwnProperty(propertyName)) {
        return obj[propertyName];
    }
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
            const result = findProperty(obj[key], propertyName);
            if (result !== undefined) {
                return result;
            }
        }
    }
    return undefined;
}

function checkCriteria(purchase_event, criteria) {
    if (!criteria.enabled) {
        debugLog('Criteria checking is disabled.');
        return true; // Bypass criteria checking
    }

    let allCriteriaMet = true; // Variable to track if all criteria are met

    // Check for the existence of properties
    if (criteria.checkExistence) {
        for (const propertyName of criteria.checkExistence) {
            const value = findProperty(purchase_event, propertyName);
            debugLog(`Checking existence of property: ${propertyName}, Found value: ${value}`);
            if (value === undefined) {
                debugLog(`Property ${propertyName} does not exist.`);
                allCriteriaMet = false;
            }
        }
    }

    // Check for matching value patterns if checkValue is enabled
    if (criteria.checkValue) {
        for (const [propertyName, targetValue] of Object.entries(criteria.matchValue)) {
            const value = findProperty(purchase_event, propertyName);
            debugLog(`Checking match for property: ${propertyName}, Target value: ${targetValue}, Found value: ${value}`);
            if (value === undefined || value !== targetValue) {
                debugLog(`Property ${propertyName} does not match value ${targetValue}. Value: ${value}`);
                allCriteriaMet = false;
            }
        }
    }

    return allCriteriaMet;
}

async function postTransaction(convert_attributes_str, purchase_event, isFirstSale) {
    debugLog("Starting postTransaction function.");

    try {
        const convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes && purchase_event) {
            // Apply the filtering criteria if enabled
            const purchase_event_str = JSON.stringify(purchase_event);
            debugLog(`Purchase Event: ${purchase_event_str}`);
            if (ENABLE_PROPERTY_FILTERING && !checkCriteria(purchase_event, filterCriteria)) {
                debugLog("Transaction filtered out based on criteria:", filterCriteria);
                return;
            }

            debugLog("Building POST data for transaction.");

            let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);

            debugLog(`Transaction amount: ${transactionAmount}, Min order value: ${convert_attributes.min_order_value}, Max order value: ${convert_attributes.max_order_value}`);

            if (transactionAmount >= convert_attributes.min_order_value && transactionAmount <= convert_attributes.max_order_value) {

                if (convert_attributes.conversion_rate && convert_attributes.conversion_rate !== 1) {
                    transactionAmount *= convert_attributes.conversion_rate;
                    debugLog(`Transaction amount adjusted by conversion rate (${convert_attributes.conversion_rate}): ${transactionAmount}`);
                }

                const transactionId = purchase_event.data.checkout.order.id;
                const goalId = isFirstSale ? firstSale_goalid : upsell_goalid;

                const post = {
                    'cid': convert_attributes.cid,
                    'pid': convert_attributes.pid,
                    'seg': convert_attributes.defaultSegments,
                    's': 'shopify',
                    'vid': convert_attributes.vid,
                    'tid': transactionId,
                    'ev': [{
                        'evt': 'tr',
                        'goals': [goalId],
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

                // Update the saved transaction total for upsells
                if (!isFirstSale) {
                    let savedTotal = parseFloat(localStorage.getItem('upsell_total') || 0);
                    savedTotal += transactionAmount;
                    localStorage.setItem('upsell_total', savedTotal.toString());
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

async function postConversion(convert_attributes_str, isFirstSale) {
    debugLog('Starting postConversion function.');

    try {
        const convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes) {
            debugLog("Building POST data for goal hit.");

            const goalId = isFirstSale ? firstSale_goalid : upsell_goalid;
            const post = {
                'cid': convert_attributes.cid,
                'pid': convert_attributes.pid,
                'seg': convert_attributes.defaultSegments,
                's': 'shopify',
                'vid': convert_attributes.vid,
                'ev': [{
                    'evt': 'hitGoal',
                    'goals': [goalId],
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

        const isFirstSale = !browser.localStorage.getItem('first_sale_reported');
        if (isFirstSale) {
            browser.localStorage.setItem('first_sale_reported', 'true');
            // Initialize upsell total
            localStorage.setItem('upsell_total', '0');
        }

        await postConversion(result, isFirstSale);
        await postTransaction(result, event, isFirstSale);
    } catch (error) {
        console.error('Error in checkout_completed promise chain:', error);
    }
});

analytics.subscribe("product_added_to_cart", async (event) => {
    debugLog("Event received for product_added_to_cart.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, false); // It's not the first sale, so pass false
    } catch (error) {
        console.error('Error retrieving convert_attributes for product_added_to_cart:', error);
    }
});

analytics.subscribe("checkout_started", async (event) => {
    debugLog("Event received for checkout_started.");

    try {
        const result = await browser.localStorage.getItem('convert_attributes');
        await postConversion(result, false); // It's not the first sale, so pass false
    } catch (error) {
        console.error('Error retrieving convert_attributes for checkout_started:', error);
    }
});