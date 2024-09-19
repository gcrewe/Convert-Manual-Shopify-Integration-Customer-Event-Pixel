// Debugging flag
const DEBUG = true;  // Set to true to enable debug logs, set to false to disable them
const ENABLE_PROPERTY_FILTERING = true;  // Set to false to disable property filtering

// Goal IDs
const purchaseGoalId = '100136097';   // General goal ID for all purchases
const subscriptionGoalId = '100137017';   // Specific goal ID for subscriptions
const nonSubscriptionGoalId = '100137016';   // Specific goal ID for non-subscriptions

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

// Function to find a property within a nested structure
function findProperty(obj, propertyName) {
  const parts = propertyName.split('.');
  let currentValue = obj;

  for (const part of parts) {
    if (currentValue?.[part] !== undefined) {
      currentValue = currentValue[part];
    } else {
      return undefined;
    }
  }

  return currentValue;
}

// Function to check criteria based on a purchase event
function checkCriteria(purchase_event, criteria) {
  if (!criteria.checkExistence || !criteria.checkExistence.length) {
    return true;  // No criteria to check
  }

  // Debug log the entire purchase_event to understand its structure
  debugLog('Full purchase_event:', JSON.stringify(purchase_event, null, 2));

  const lineItems = findProperty(purchase_event, 'data.checkout.lineItems');
  if (!Array.isArray(lineItems)) {
    debugLog("No lineItems found in purchase_event");
    return false;  // No lineItems, fail the criteria
  }

  return criteria.checkExistence.every(propertyName => {
    const propertyFound = lineItems.some(lineItem => {
      const value = findProperty(lineItem, propertyName);
      debugLog(`Checking existence of property in lineItem: ${propertyName}, Found value: ${value}`);
      return value !== undefined;
    });

    if (!propertyFound) {
      debugLog(`Property ${propertyName} does not exist in any line item.`);
    }

    return propertyFound;
  });
}

// Function to handle the transaction posting logic
async function postTransaction(convert_attributes_str, purchase_event) {
  debugLog("Starting postTransaction function.");

  try {
    let convert_attributes;
    if (isValidJSON(convert_attributes_str)) {
      convert_attributes = JSON.parse(convert_attributes_str);
    } else {
      debugLog("Invalid JSON for convert_attributes.", convert_attributes_str);
      return;
    }

    if (!(convert_attributes && purchase_event)) {
      debugLog("Invalid or missing convert_attributes or purchase_event.");
      return;
    }

    // Determine if the purchase event matches subscription or non-subscription criteria
    const goalIds = [purchaseGoalId];  // Start with the general purchase goal
    if (ENABLE_PROPERTY_FILTERING) {
      if (checkCriteria(purchase_event, { checkExistence: ['sellingPlanAllocation'] })) { // Adjusted property name to check variant SKU
        goalIds.push(subscriptionGoalId); // Assuming subscription has SKU, adjust as necessary
      } else {
        goalIds.push(nonSubscriptionGoalId);
      }

    debugLog("Goal IDs to be tracked:", goalIds);

    debugLog("Building POST data for transaction.");

    let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);
    if (isNaN(transactionAmount)) {
      throw new Error("Invalid transaction amount.");
    }

    debugLog(`Transaction amount: ${transactionAmount}, Min order value: ${convert_attributes.min_order_value}, Max order value: ${convert_attributes.max_order_value}`);

    if (transactionAmount < convert_attributes.min_order_value || transactionAmount > convert_attributes.max_order_value) {
      debugLog("Transaction amount filtered out. Amount:", transactionAmount);
      return;
    }

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
        'goals': goalIds,  // Include all relevant goals
        'exps': convert_attributes.exps,
        'vars': convert_attributes.vars,
        'r': transactionAmount,
        'prc': purchase_event.data.checkout.lineItems.length
      },{
        'evt': 'hitGoal',
        'goals': goalIds,  // Include all relevant goals
        'exps': convert_attributes.exps,
        'vars': convert_attributes.vars
      }]
    };

    // JSON.stringify only once, and no need to parse it again.
    const data = JSON.stringify(post);

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
  } catch (error) {
    console.error('Error in postTransaction:', error);
  }
}

// Event subscriptions using an analytics platform
analytics.subscribe("checkout_completed", async (event) => {
  debugLog("Event received for checkout_completed.");
  try {
    let convert_attributes_str = await browser.localStorage.getItem('convert_attributes');

    if (!convert_attributes_str) {
      debugLog("convert_attributes not found in localStorage, attempting to retrieve from event data...");
      convert_attributes_str = findProperty(event.data.checkout, 'customAttributes');
      if (!convert_attributes_str) {
        debugLog("convert_attributes not found in event.data.checkout.customAttributes");
      }
      convert_attributes_str = JSON.stringify(convert_attributes_str);
    }

    if (!convert_attributes_str || !isValidJSON(convert_attributes_str)) {
      throw new Error("Invalid or missing convert_attributes.");
    }

    await postTransaction(convert_attributes_str, event);
  } catch (error) {
    console.error('Error in checkout_completed event handler:', error);
  }
});