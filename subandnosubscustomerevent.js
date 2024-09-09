// Debugging flag
const DEBUG = true; // Set to true to enable debug logs, set to false to disable them
const ENABLE_PROPERTY_FILTERING = true; // Set to false to disable property filtering

// Goal IDs
const purchaseGoalId = '100136097'; // General goal ID for all purchases
const subscriptionGoalId = '100137017'; // Specific goal ID for subscriptions
const nonSubscriptionGoalId = '100137016'; // Specific goal ID for non-subscriptions

// Debugging function to log messages when DEBUG is true
function debugLog(message, ...optionalParams) {
    if (DEBUG) {
        console.log('Convert Shopify Integration:', message, ...optionalParams);
    }
}

// Function to check if JSON is valid
function isValidJSON(data) {
    try {
        JSON.parse(data);
        return true;
    } catch (e) {
        return false;
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

// Function to check criteria based on a purchase event
function checkCriteria(purchase_event, criteria) {
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

    return allCriteriaMet;
}

// Function to handle the transaction posting logic
async function postTransaction(convert_attributes_str, purchase_event) {
    debugLog("Starting postTransaction function.");

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes && purchase_event) {
            // Determine if the purchase event matches subscription or non-subscription criteria
            let goalId = null;
            if (ENABLE_PROPERTY_FILTERING) {
                if (checkCriteria(purchase_event, { checkExistence: ['sellingPlanAllocation'] })) {
                    goalId = subscriptionGoalId;
                } else {
                    goalId = nonSubscriptionGoalId;
                }
            } else {
                // Default to non-subscription goal if filtering is disabled
                goalId = nonSubscriptionGoalId;
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

// Event subscriptions using an analytics platform
analytics.subscribe("checkout_completed", async (event) => {
    debugLog("Event received for checkout_completed.");
    let result = await browser.localStorage.getItem('convert_attributes');
    if (!result) {
        result = findProperty(event.data.checkout, 'custom_attributes');
        result = JSON.stringify(result);
    }
    await postTransaction(result, event);
});
