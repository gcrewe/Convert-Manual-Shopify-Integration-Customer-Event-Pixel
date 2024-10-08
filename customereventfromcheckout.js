const DEBUG = true; // Set to false to disable debug logs
const ENABLE_PROPERTY_FILTERING = true; // Set to false to disable property filtering

const purchase_goalid = '100136097'; // Change this to your own purchase goal ID

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

async function postTransaction(purchase_event, purchase_goalid) {
    debugLog("Starting postTransaction function.");

    try {
        const convert_attributes = purchase_event.data.checkout.customAttributes;

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

async function postConversion(purchase_event, goalid) {
    debugLog('Starting postConversion function with goal id:', goalid);

    try {
        const convert_attributes = purchase_event.data.checkout.customAttributes;

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
        await postConversion(event, purchase_goalid);
        await postTransaction(event, purchase_goalid);
    } catch (error) {
        console.error('Error in checkout_completed promise chain:', error);
    }
});
