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

// Function to enforce outlier limits
function isWithinOutlierLimits(transactionAmount, min_order_value, max_order_value) {
  return transactionAmount >= min_order_value && transactionAmount <= max_order_value;
}

// Post conversion function
async function postConversion(convert_attributes_str, goalIds) {
  debugLog('Starting postConversion function with goal ids:', goalIds);

  try {
    const convert_attributes = JSON.parse(convert_attributes_str);

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
          'goals': goalIds,
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

// Function to handle the transaction posting logic
async function postTransaction(convert_attributes_str, purchase_event, goalIdsToReport) {
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

    // Goal IDs for tracking
    const goalIds = goalIdsToReport;
    debugLog("Goal IDs to be tracked:", goalIds);

    debugLog("Building POST data for transaction.");
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
        'goals': goalIds,  // Include all relevant goals
        'vars': convert_attributes.vars,        
        'exps': convert_attributes.exps,
        'r': parseFloat(purchase_event.data.checkout.totalPrice.amount),
        'prc': purchase_event.data.checkout.lineItems.length
        }
      ]
    };

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

// Event subscription for checkout_completed (fires both conversion and transaction)
analytics.subscribe("checkout_completed", async (event) => {
  debugLog("Event received for checkout_completed.");

  try {
    const purchase_event = event;  // Assuming event is structured like purchase_event
    let convert_attributes_str = await browser.localStorage.getItem('convert_attributes');

    // If not found in localStorage, retrieve from event data
    if (!convert_attributes_str) {
      convert_attributes_str = findProperty(event.data.checkout, 'customAttributes');
      debugLog("convert_attributes retrieved from customAttributes in event:", convert_attributes_str);
      convert_attributes_str = JSON.stringify(convert_attributes_str);
    }

    if (!convert_attributes_str || !isValidJSON(convert_attributes_str)) {
      debugLog("Invalid or missing convert_attributes.");
      return;
    }

    const convert_attributes = JSON.parse(convert_attributes_str);

    // Outlier check for transaction amount
    let transactionAmount = parseFloat(purchase_event.data.checkout.totalPrice.amount);
    if (isNaN(transactionAmount) || !isWithinOutlierLimits(transactionAmount, convert_attributes.min_order_value, convert_attributes.max_order_value)) {
      debugLog("Transaction amount out of limits:", transactionAmount);
      return;  // Do not report anything if transaction is outside limits
    }

    // Determine the correct goals based on criteria
    let goalIds = [purchaseGoalId];

    // Ensure that every purchase is attributed to either subscriptionGoalId or nonSubscriptionGoalId
    if (ENABLE_PROPERTY_FILTERING) {
        // Check if the purchase event qualifies as a subscription
        if (checkCriteria(purchase_event, { checkExistence: ['sellingPlanAllocation'] })) {
            goalIds.push(subscriptionGoalId);
        } else {
            goalIds.push(nonSubscriptionGoalId);
        }
    } else {
        // If property filtering is disabled, consider all purchases as non-subscription
        goalIds.push(nonSubscriptionGoalId);
    }

    // Submit both conversion and transaction
    await postConversion(convert_attributes_str, goalIds);
    await postTransaction(convert_attributes_str, purchase_event, goalIds);

  } catch (error) {
    console.error('Error in checkout_completed event handler:', error);
  }
});
