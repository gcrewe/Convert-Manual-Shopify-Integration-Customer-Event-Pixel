// version 10.0
// Debugging flag
const DEBUG = true;  // Set to true to enable debug logs, set to false to disable them

// Enable property filtering flag
const ENABLE_PROPERTY_FILTERING = false; // Set to false to disable property filtering

// Configuration object for filtering criteria
const filterCriteria = {
    enabled: false, // Enable or disable criteria checking
    checkExistence: ['sku'], // List of properties that must exist
    matchValue: {
        'sku': '23026961-pink-united-states-l-diameter-7-5cm' // Exact string values to match
    },
    checkValue: false // Enable or disable value matching
};

// Goal IDs
const purchaseGoalId = '100136097';   // General goal ID for all purchases
const subscriptionGoalId = '100137017';   // Specific goal ID for subscriptions
const nonSubscriptionGoalId = '100137016';   // Specific goal ID for non-subscriptions
const addToCartGoalId = '100137018';   // Goal ID for add to cart events

// Debugging function with timestamp
function debugLog(message, ...optionalParams) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Convert Integration:`, message, ...optionalParams);
  }
}

// Function to check if JSON is valid
function isValidJSON(data) {
  try {
    JSON.parse(data);
    debugLog('JSON validation successful');
    return true;
  } catch (e) {
    debugLog('JSON validation failed:', e.message);
    return false;
  }
}

// Function to find a property within a nested structure
function findProperty(obj, propertyName) {
  debugLog(`Searching for property: ${propertyName}`);
  const parts = propertyName.split('.');
  let currentValue = obj;

  for (const part of parts) {
    if (currentValue?.[part] !== undefined) {
      currentValue = currentValue[part];
      debugLog(`Found nested property ${part}:`, currentValue);
    } else {
      debugLog(`Property ${part} not found in current object`);
      return undefined;
    }
  }

  return currentValue;
}

// Function to check criteria for filtering
function checkCriteria(event, criteria) {
  debugLog('Checking criteria for filtering');

  // If criteria checking is disabled, always return true
  if (!criteria.enabled) {
    debugLog('Criteria checking is disabled, bypassing checks');
    return true;
  }

  // Check if required properties exist
  if (criteria.checkExistence && criteria.checkExistence.length > 0) {
    for (const prop of criteria.checkExistence) {
      if (findProperty(event, prop) === undefined) {
        debugLog(`Required property ${prop} not found in event, filtering out`);
        return false;
      }
    }
    debugLog('All required properties exist');
  }

  // Check if values match criteria
  if (criteria.checkValue && criteria.matchValue) {
    for (const prop in criteria.matchValue) {
      const value = findProperty(event, prop);
      if (value !== criteria.matchValue[prop]) {
        debugLog(`Property ${prop} value ${value} does not match criteria ${criteria.matchValue[prop]}, filtering out`);
        return false;
      }
    }
    debugLog('All property values match criteria');
  }

  debugLog('Event passed all filtering criteria');
  return true;
}

// Function to check if purchase is a subscription
function isSubscriptionPurchase(purchase_event) {
  debugLog('Checking if purchase is a subscription');
  debugLog('Purchase event:', purchase_event);

  // Validate input parameters
  if (!purchase_event?.data?.checkout?.lineItems) {
    debugLog('Invalid purchase event structure');
    return false;
  }

  const lineItems = purchase_event.data.checkout.lineItems;
  debugLog(`Checking ${lineItems.length} line items for subscription`);

  // Check if any line item has a sellingPlanAllocation and it's not null
  return lineItems.some(lineItem => {
    const hasSellingPlanAllocation = lineItem.hasOwnProperty('sellingPlanAllocation') && 
                                   lineItem.sellingPlanAllocation !== null;
    debugLog(`Line item ${lineItem.id} has sellingPlanAllocation: ${hasSellingPlanAllocation}`);
    return hasSellingPlanAllocation;
  });
}

// Post conversion function
async function postConversion(convert_attributes_str, goalIds) {
  debugLog('Starting postConversion function with goal ids:', goalIds);

  try {
    const convert_attributes = JSON.parse(convert_attributes_str);
    debugLog('Parsed convert_attributes:', convert_attributes);

    if (convert_attributes) {
      debugLog("Building POST data for goal hit");
      const post = {
        'cid': convert_attributes.cid,
        'pid': convert_attributes.pid,
        'seg': convert_attributes.defaultSegments,
        's': 'shopify',
        'vid': convert_attributes.vid,
        'ev': [{
          'evt': 'hitGoal',
          'goals': goalIds,
          'exps': convert_attributes.exps,
          'vars': convert_attributes.vars
        }]
      };
      debugLog('Constructed POST data:', post);

      let data = JSON.stringify(post);
      const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;
      debugLog('Sending request to:', beaconUrl);

      try {
        const response = await fetch(beaconUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: data
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        debugLog("Conversion tracking request successful:", result);
      } catch (fetchError) {
        console.error('Error in conversion tracking request:', fetchError);
      }
    } else {
      console.error("Invalid or missing convert_attributes");
    }
  } catch (parseError) {
    console.error('Error parsing JSON in postConversion:', parseError);
  }
}

// Function to handle the transaction posting logic
async function postTransaction(convert_attributes_str, purchase_event, goalIds) {
  debugLog("Starting postTransaction function");

  try {
    let convert_attributes;
    if (isValidJSON(convert_attributes_str)) {
      convert_attributes = JSON.parse(convert_attributes_str);
      debugLog('Parsed convert_attributes:', convert_attributes);
    } else {
      debugLog("Invalid JSON for convert_attributes:", convert_attributes_str);
      return;
    }

    if (!(convert_attributes && purchase_event)) {
      debugLog("Invalid or missing convert_attributes or purchase_event");
      return;
    }

    // Apply the filtering criteria if enabled
    if (ENABLE_PROPERTY_FILTERING && !checkCriteria(purchase_event, filterCriteria)) {
      debugLog("Transaction filtered out based on criteria");
      return;
    }

    debugLog("Building POST data for transaction");

    // Get the transaction amount in the PRESENTMENT currency (what customer sees)
    let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);
    const originalTransactionAmount = transactionAmount;

    debugLog(`Original Transaction amount: ${originalTransactionAmount} ${purchase_event.data.checkout.totalPrice.currencyCode}`);

    // Try to get the base currency amount directly
    let baseCurrencyAmount = null;

    // Method 1: Check if shop money (base currency) data is available
    if (purchase_event.data.checkout.totalPrice && purchase_event.data.checkout.totalPrice.shopMoney) {
      baseCurrencyAmount = parseFloat(purchase_event.data.checkout.totalPrice.shopMoney.amount);
      debugLog(`Found direct shop base currency amount: ${baseCurrencyAmount} ${purchase_event.data.checkout.totalPrice.shopMoney.currencyCode}`);
    } 

    // Method 2: Alternative path if first method not available
    else if (purchase_event.data.checkout.shop_money_total_price) {
      baseCurrencyAmount = parseFloat(purchase_event.data.checkout.shop_money_total_price);
      debugLog(`Found shop_money_total_price: ${baseCurrencyAmount}`);
    }

    // Method 3: Check if currency code and rate are available
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

    // Method 4: Check if we have a currency rate directly on the checkout object
    else if (purchase_event.data.checkout.currency_rate) {
      const currencyRate = parseFloat(purchase_event.data.checkout.currency_rate);
      if (currencyRate !== 1) {
        baseCurrencyAmount = originalTransactionAmount / currencyRate;
        debugLog(`Calculated base currency amount using checkout.currency_rate ${currencyRate}: ${baseCurrencyAmount}`);
      } else {
        baseCurrencyAmount = originalTransactionAmount;
      }
    }

    // If we found a base currency amount, use it
    if (baseCurrencyAmount !== null) {
      debugLog(`Using base currency amount: ${baseCurrencyAmount} instead of presentment amount`);
      transactionAmount = baseCurrencyAmount;
    } else {
      debugLog(`No base currency amount found, using original presentment amount: ${transactionAmount}`);
    }

    const transactionId = purchase_event.data.checkout.order.id;
    const post = {
      'cid': convert_attributes.cid,
      'pid': convert_attributes.pid,
      'seg': convert_attributes.defaultSegments,
      's': 'shopify',
      'vid': convert_attributes.vid,
      'tid': transactionId,
      'ev': [
        {
        'evt': 'tr',
        'goals': goalIds,
        'vars': convert_attributes.vars,        
        'exps': convert_attributes.exps,
        'r': transactionAmount,
        'prc': purchase_event.data.checkout.lineItems.length
        }
      ]
    };
    debugLog('Constructed transaction POST data:', post);

    const data = JSON.stringify(post);
    const beaconUrl = `https://${convert_attributes.pid}.metrics.convertexperiments.com/track`;
    debugLog('Sending transaction request to:', beaconUrl);

    try {
      const response = await fetch(beaconUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: data
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      debugLog("Transaction tracking request successful:", result);
      debugLog("Transaction ID:", transactionId);
      debugLog("Purchase event data:", JSON.stringify(purchase_event.data, null, 2));
    } catch (fetchError) {
      console.error('Error in transaction tracking request:', fetchError);
    }
  } catch (error) {
    console.error('Error in postTransaction:', error);
  }
}

// Event subscription for checkout_completed
analytics.subscribe("checkout_completed", async (event) => {
  debugLog("Checkout completed event received");
  debugLog("Full event data:", JSON.stringify(event, null, 2));

  try {
    const purchase_event = event;
    debugLog("Processing purchase event");

    let convert_attributes_str = await browser.localStorage.getItem('convert_attributes');
    debugLog("Initial convert_attributes from localStorage:", convert_attributes_str);

    if (!convert_attributes_str) {
      convert_attributes_str = findProperty(event.data.checkout, 'customAttributes');
      debugLog("convert_attributes retrieved from customAttributes:", convert_attributes_str);
      convert_attributes_str = JSON.stringify(convert_attributes_str);
    }

    if (!convert_attributes_str || !isValidJSON(convert_attributes_str)) {
      debugLog("Invalid or missing convert_attributes, stopping execution");
      return;
    }

    // Always include the general purchase goal
    let goalIds = [purchaseGoalId];
    debugLog("Added general purchase goal:", purchaseGoalId);

    // Check if this is a subscription purchase
    if (isSubscriptionPurchase(purchase_event)) {
      goalIds.push(subscriptionGoalId);
      debugLog("Subscription purchase detected, added subscription goal:", subscriptionGoalId);
    } else {
      goalIds.push(nonSubscriptionGoalId);
      debugLog("Non-subscription purchase detected, added non-subscription goal:", nonSubscriptionGoalId);
    }

    debugLog("Final goal IDs for tracking:", goalIds);

    // Submit both conversion and transaction
    await postConversion(convert_attributes_str, goalIds);
    await postTransaction(convert_attributes_str, purchase_event, goalIds);
    debugLog("Checkout completed event processing finished successfully");

  } catch (error) {
    console.error('Error in checkout_completed event handler:', error);
    debugLog("Error details:", error);
  }
});

// Event subscription for add_to_cart
analytics.subscribe("product_added_to_cart", async (event) => {
  debugLog("Add to cart event received");
  debugLog("Full event data:", JSON.stringify(event, null, 2));

  try {
    let convert_attributes_str = await browser.localStorage.getItem('convert_attributes');
    debugLog("Initial convert_attributes from localStorage:", convert_attributes_str);

    if (!convert_attributes_str) {
      convert_attributes_str = findProperty(event.data, 'customAttributes');
      debugLog("convert_attributes retrieved from customAttributes:", convert_attributes_str);
      convert_attributes_str = JSON.stringify(convert_attributes_str);
    }

    if (!convert_attributes_str || !isValidJSON(convert_attributes_str)) {
      debugLog("Invalid or missing convert_attributes, stopping execution");
      return;
    }

    // Fire add to cart goal
    await postConversion(convert_attributes_str, [addToCartGoalId]);
    debugLog("Add to cart goal tracking completed successfully");

  } catch (error) {
    console.error('Error in add_to_cart event handler:', error);
    debugLog("Error details:", error);
  }
});
