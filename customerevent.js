// version 10.0

const DEBUG = true; // Set to false to disable debug logs
const ENABLE_PROPERTY_FILTERING = false; // Set to false to disable property filtering

// Change to fit your own Convert goals
// If need to create them, create a Custom JS Goal and get its ids
const purchase_goalid = '100136097';
const addToCart_goalid = '100136098';
const checkoutStarted_goalid = '100132287';

// Configuration object for filtering criteria
const filterCriteria = {
    enabled: false, // Enable or disable criteria checking
    checkExistence: ['sku'], // List of properties that must exist
    matchValue: {
        'sku': '23026961-pink-united-states-l-diameter-7-5cm' // Exact string values to match
    },
    checkValue: false // Enable or disable value matching
};

// Add the checkCriteria function if it was missing from the original code
function checkCriteria(event, criteria) {
    // If criteria checking is disabled, always return true
    if (!criteria.enabled) return true;

    // Check if required properties exist
    if (criteria.checkExistence && criteria.checkExistence.length > 0) {
        for (const prop of criteria.checkExistence) {
            if (findProperty(event, prop) === undefined) {
                debugLog(`Required property ${prop} not found in event`);
                return false;
            }
        }
    }

    // Check if values match criteria
    if (criteria.checkValue && criteria.matchValue) {
        for (const prop in criteria.matchValue) {
            const value = findProperty(event, prop);
            if (value !== criteria.matchValue[prop]) {
                debugLog(`Property ${prop} value ${value} does not match criteria ${criteria.matchValue[prop]}`);
                return false;
            }
        }
    }

    return true;
}

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

// Function to get a cookie value by name
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function getConvertAttributes(event) {
    debugLog("Starting getConvertAttributes function");

    let result = localStorage.getItem('convert_attributes');
    debugLog("LocalStorage result:", result);

    if (!result) {
        debugLog("convert_attributes not found in localStorage, checking cookie");
        result = getCookie('convert_attributes');
        debugLog("Cookie result:", result);

        if (result) {
            debugLog("convert_attributes found in cookie");
            try {
                result = decodeURIComponent(result);
                // Validate JSON
                JSON.parse(result);
                debugLog("Successfully decoded cookie value:", result);
            } catch (e) {
                console.error("Error decoding cookie value:", e);
                result = null;
            }
        } else if (event && event.data && event.data.checkout) {
            debugLog("Checking event data:", event.data);
            result = findProperty(event.data.checkout, 'customAttributes');
            debugLog("Event data result:", result);

            if (result) {
                debugLog("convert_attributes found in event custom attributes");
                if (typeof result !== 'string') {
                    result = JSON.stringify(result);
                }
            }
        }
    }

    // Validate final result
    if (result) {
        try {
            const parsed = JSON.parse(typeof result === 'string' ? result : JSON.stringify(result));
            debugLog("Final validated result:", parsed);
            return JSON.stringify(parsed);
        } catch (e) {
            console.error("Error validating final result:", e);
            return null;
        }
    }

    debugLog("No valid convert_attributes found");
    return null;
}

function postConversion(convert_attributes_str, goalid) {
    debugLog('Starting postConversion function with goal id:', goalid);

    if (!convert_attributes_str) {
        console.error('Error: convert_attributes_str is empty or null');
        return; // Exit the function early
    }

    try {
        // Decode the string if it's URL-encoded
        if (convert_attributes_str.indexOf('%') !== -1) {
            convert_attributes_str = decodeURIComponent(convert_attributes_str);
        }
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (!convert_attributes || Object.keys(convert_attributes).length === 0) {
            console.error('Error: convert_attributes is empty or invalid after parsing');
            return; // Exit the function early
        }

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

        const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;

        // Use sendBeacon to ensure the request is sent even if the page is unloading
        if (navigator.sendBeacon) {
            const blob = new Blob([data], {type : 'application/json'});
            const success = navigator.sendBeacon(beaconUrl, blob);
            debugLog("Beacon sent:", success);
        } else {
            // Fallback to fetch if sendBeacon is not available
            fetch(beaconUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: data,
                keepalive: true // This option keeps the request alive even if the page is unloading
            }).then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            }).then(result => {
                debugLog("fetch result:", result);
            }).catch(fetchError => {
                console.error('Error in fetch request:', fetchError);
            });
        }
    } catch (parseError) {
        console.error('Error parsing JSON in postConversion:', parseError);
    }
}

async function postTransaction(convert_attributes_str, purchase_event, purchase_goalid) {
    debugLog("Starting postTransaction function.");

    if (!convert_attributes_str) {
        console.error('Error: convert_attributes_str is empty or null');
        return; // Exit the function early
    }

    try {
        // Decode the string if it's URL-encoded
        if (convert_attributes_str.indexOf('%') !== -1) {
            convert_attributes_str = decodeURIComponent(convert_attributes_str);
        }
        var convert_attributes = JSON.parse(convert_attributes_str);

        if (!convert_attributes || Object.keys(convert_attributes).length === 0) {
            console.error('Error: convert_attributes is empty or invalid after parsing');
            return; // Exit the function early
        }

        if (!purchase_event) {
            console.error('Error: purchase_event is null or undefined');
            return; // Exit the function early
        }

        // Apply the filtering criteria if enabled
        var purchase_event_str = JSON.stringify(purchase_event);
        debugLog(`Purchase Event: ${purchase_event_str}`);
        if (ENABLE_PROPERTY_FILTERING && !checkCriteria(purchase_event, filterCriteria)) {
            debugLog("Transaction filtered out based on criteria:", filterCriteria);
            return;
        }

        debugLog("Building POST data for transaction.");

        // Get the transaction amount in the PRESENTMENT currency (what customer sees)
        let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);
        const originalTransactionAmount = transactionAmount;

        debugLog(`Original Transaction amount: ${originalTransactionAmount} ${purchase_event.data.checkout.totalPrice.currencyCode}`);

        // Try to get the base currency amount directly
        let baseCurrencyAmount = null;

        // Check if shop money (base currency) data is available
        if (purchase_event.data.checkout.totalPrice && purchase_event.data.checkout.totalPrice.shopMoney) {
            baseCurrencyAmount = parseFloat(purchase_event.data.checkout.totalPrice.shopMoney.amount);
            debugLog(`Found direct shop base currency amount: ${baseCurrencyAmount} ${purchase_event.data.checkout.totalPrice.shopMoney.currencyCode}`);
        } 

        // Alternative path if first method not available
        else if (purchase_event.data.checkout.shop_money_total_price) {
            baseCurrencyAmount = parseFloat(purchase_event.data.checkout.shop_money_total_price);
            debugLog(`Found shop_money_total_price: ${baseCurrencyAmount}`);
        }

        // Check if currency code and rate are available (another alternative)
        else if (purchase_event.data.checkout.currencyCode && 
                 purchase_event.data.checkout.presentmentCurrencyRate) {
            const presentmentCurrency = purchase_event.data.checkout.currencyCode;
            const presentmentRate = parseFloat(purchase_event.data.checkout.presentmentCurrencyRate);

            if (presentmentRate !== 1) {
                baseCurrencyAmount = originalTransactionAmount / presentmentRate;
                debugLog(`Calculated base currency amount using rate ${presentmentRate}: ${baseCurrencyAmount}`);
            } else {
                // If rate is 1, it's already in base currency
                baseCurrencyAmount = originalTransactionAmount;
                debugLog('Using original amount as rate is 1');
            }
        }

        // Check if we have a currency rate directly on the checkout object
        else if (purchase_event.data.checkout.currency_rate) {
            const currencyRate = parseFloat(purchase_event.data.checkout.currency_rate);
            if (currencyRate !== 1) {
                baseCurrencyAmount = originalTransactionAmount / currencyRate;
                debugLog(`Calculated base currency amount using checkout.currency_rate ${currencyRate}: ${baseCurrencyAmount}`);
            } else {
                baseCurrencyAmount = originalTransactionAmount;
            }
        }

        // If we found a base currency amount, use it instead of applying conversion rate
        if (baseCurrencyAmount !== null) {
            debugLog(`Using base currency amount: ${baseCurrencyAmount} instead of converted amount`);
            transactionAmount = baseCurrencyAmount;
        }
        // If we couldn't find base currency amount, continue with original logic
        else {
            debugLog(`Could not find direct base currency amount, using original logic with conversion rate`);

            if (convert_attributes.conversionRate && convert_attributes.conversionRate !== 1) {
                debugLog(
                    `Applying conversion rate: ${convert_attributes.conversionRate}. ` +
                    `Original amount: ${transactionAmount}`
                );
                transactionAmount *= convert_attributes.conversionRate;
                debugLog(
                    `Adjusted Transaction amount after conversion: ${transactionAmount}`
                );
            }
        }

        debugLog(`Min order value: ${convert_attributes.min_order_value}, Max order value: ${convert_attributes.max_order_value}`);

        if (transactionAmount >= convert_attributes.min_order_value && transactionAmount <= convert_attributes.max_order_value) {
            debugLog(`Performing transaction with amount: ${transactionAmount}`);

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
    } catch (parseError) {
        console.error('Error parsing JSON in postTransaction:', parseError);
    }
}

analytics.subscribe("checkout_completed", async (event) => {
    debugLog("Event received for checkout_completed.");

    try {
        let result = getConvertAttributes(event);
        if (!result) {
            console.error("Error: Unable to find convert_attributes in localStorage, cookie, or event data");
            return; // Exit early if no data is found
        }
        await postConversion(result, purchase_goalid);
        await postTransaction(result, event, purchase_goalid);
    } catch (error) {
        console.error('Error in checkout_completed promise chain:', error);
    }
});

analytics.subscribe("checkout_started", async (event) => {
    debugLog("Event received for checkout_started.");
    debugLog("Event data:", event);

    try {
        let result = getConvertAttributes(event);
        if (!result) {
            console.error("Error: Unable to find convert_attributes in localStorage, cookie, or event data");
            result = getConvertAttributes(event);
            if (!result) {
                return;
            }
        }

        debugLog("Convert attributes before posting:", result);
        await postConversion(result, checkoutStarted_goalid);
    } catch (error) {
        console.error('Error in checkout_started handler:', error);
    }
});

analytics.subscribe("product_added_to_cart", async (event) => {
    debugLog("Event received for product_added_to_cart.");

    try {
        let result = getConvertAttributes(event);
        if (!result) {
            console.error("Error: Unable to find convert_attributes in localStorage, cookie, or event data");
            return; // Exit early if no data is found
        }
        await postConversion(result, addToCart_goalid);
    } catch (error) {
        console.error('Error retrieving convert_attributes for checkout_started:', error);
    }
});