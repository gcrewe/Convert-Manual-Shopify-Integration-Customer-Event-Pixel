// Debugging flag
const DEBUG = true;  // Set to true to enable debug logs, set to false to disable them

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

    debugLog("Building POST data for transaction");
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
        'r': parseFloat(purchase_event.data.checkout.totalPrice.amount),
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
