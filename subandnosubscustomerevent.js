const DEBUG = true; // Set to false to disable debug logs
const ENABLE_PROPERTY_FILTERING = true; // Set to false to disable property filtering

const subscriptionGoalId = 'subscription_goal_id'; // Replace with the actual goal ID for subscriptions
const nonSubscriptionGoalId = 'non_subscription_goal_id'; // Replace with the actual goal ID for non-subscriptions

const purchase_goalid = '100136097';

// Configuration object for filtering criteria
const filterCriteria = {
    subscription: {
        checkExistence: ['selling_plan_allocation'], // List of properties that must exist
        checkValue: false // Disable value matching, only check existence
    },
    nonSubscription: {
        checkExistence: [], // No specific properties required to exist for non-subscription
        checkValue: false // Disable value matching
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

async function postTransaction(convert_attributes_str, purchase_event, subGoalId, nonSubGoalId) {
    debugLog("Starting postTransaction function.");

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes && purchase_event) {
            // Determine if the purchase event matches subscription or non-subscription criteria
            let goalId = null;
            if (ENABLE_PROPERTY_FILTERING) {
                if (checkCriteria(purchase_event, filterCriteria.subscription)) {
                    goalId = subGoalId;
                } else {
                    goalId = nonSubGoalId;
                }
            } else {
                // Default to non-subscription goal if filtering is disabled
                goalId = nonSubGoalId;
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

async function postConversion(convert_attributes_str, subGoalId, nonSubGoalId, purchase_event) {
    debugLog('Starting postConversion function.');

    try {
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (convert_attributes) {
            debugLog("Building POST data for goal hit.");
            let goalId = ENABLE_PROPERTY_FILTERING && checkCriteria(purchase_event, filterCriteria.subscription)
                ? subGoalId
                : nonSubGoalId;

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
        await postConversion(result, subscriptionGoalId, nonSubscriptionGoalId, event);
        await postTransaction(result, event, subscriptionGoalId, nonSubscriptionGoalId);
    } catch (error) {
        console.error('Error in checkout_completed promise chain:', error);
    }
});