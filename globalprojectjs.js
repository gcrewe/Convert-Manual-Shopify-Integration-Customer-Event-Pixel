let enableCurrencyFunctionality = true; // Changed to true by default
let storeInCookie = true;

// Enhanced currency tracking
let currentCurrency = '';
let currencyConversionRates = {};

// Function to set a cookie using convert.setCookie
function setCookie(name, value, days) {
    convert.setCookie(name, value, { expires: days });
}

// Initialize currency tracking
function initializeCurrencyTracking() {
    if (typeof Shopify !== 'undefined' && Shopify.currency) {
        currentCurrency = Shopify.currency.active;

        // Monitor currency changes
        Object.defineProperty(Shopify.currency, 'active', {
            get: function() {
                return currentCurrency;
            },
            set: function(newValue) {
                if (currentCurrency !== newValue) {
                    console.log('Currency changed from', currentCurrency, 'to', newValue);
                    currentCurrency = newValue;
                    updateConvertAttributes();
                }
            }
        });
    }
}

// Function to get current conversion rate
function getCurrentConversionRate() {
    if (typeof Currency !== 'undefined' && Currency.rates) {
        let shopCurrency = Shopify.currency.active;
        let defaultCurrency = Shopify.currency.default;

        if (Currency.rates[shopCurrency]) {
            return Currency.rates[shopCurrency];
        }
    }
    return 1; // Default to 1 if no conversion rate is found
}

// Function to update convert_attributes
function updateConvertAttributes() {
    let session_cookie = convert.getCookie('_conv_s');
    if (!session_cookie) {
        console.error('Session cookie not found.');
        return;
    }

    let session_id = session_cookie.substring(
        session_cookie.indexOf('sh:') + 3,
        session_cookie.indexOf('*')
    );

    // Get the current convert_attributes
    let convert_attributes = storeInCookie 
        ? JSON.parse(convert.getCookie('convert_attributes') || '{}')
        : JSON.parse(localStorage.getItem('convert_attributes') || '{}');

    // Update currency-related attributes
    if (enableCurrencyFunctionality && typeof Shopify !== 'undefined' && Shopify.currency) {
        convert_attributes.currency = Shopify.currency.active;
        convert_attributes.conversionRate = getCurrentConversionRate();
    }

    // Store updated attributes
    if (storeInCookie) {
        setCookie('convert_attributes', JSON.stringify(convert_attributes), 7);
        console.log('Updated convert_attributes in cookie:', convert_attributes);
    } else {
        localStorage.setItem('convert_attributes', JSON.stringify(convert_attributes));
        console.log('Updated convert_attributes in localStorage:', convert_attributes);
    }
}

// Main Convert integration
window._conv_q = window._conv_q || [];
window._conv_q.push({
    what: 'addListener',
    params: {
        event: 'snippet.experiences_evaluated',
        handler: function() {
            let session_cookie = convert.getCookie('_conv_s');
            if (!session_cookie) {
                console.error('Session cookie not found.');
                return;
            }

            let session_id = session_cookie.substring(
                session_cookie.indexOf('sh:') + 3,
                session_cookie.indexOf('*')
            );

            let exp_list = [];
            let variation_list = [];

            function processExperiences(sourceData, allData, isHistorical = false) {
                const variants = []; // Array to store variants

                for (let expID in sourceData) {
                    // Retrieve the type from main data structure to decide exclusion
                    let type = allData.experiences[expID]?.type;
                    if (type === "deploy") {
                        console.log('Skipping deploy type experiment:', expID);
                        continue; // Skip processing if type is "deploy"
                    }

                    let experience = sourceData[expID];
                    let variation = experience.variation || {};
                    let varID = variation.id || experience.variation_id;

                    if (varID && !exp_list.includes(expID)) {
                        exp_list.push(expID);
                        variation_list.push(varID);

                        // Create variant string and push to variants array
                        const variantString = `${expID}:${varID}`;
                        variants.push(variantString);

                        console.log(
                            'Adding experiment:',
                            expID,
                            'with variation:',
                            varID,
                            'from',
                            isHistorical ? 'historical data' : 'current data'
                        );
                    }
                }

                return variants; // Return the array of variants
            }

            // Process current and historical data
            if (convert.currentData && convert.currentData.experiences) {
                processExperiences(convert.currentData.experiences, convert.data);
            }

            if (convert.historicalData && convert.historicalData.experiences) {
                processExperiences(convert.historicalData.experiences, convert.data, true);
            }

            function alignSegmentsToFirstFormat(segFromSecondFormat) {
                const alignedSeg = {
                    browser: segFromSecondFormat.browser,
                    devices: segFromSecondFormat.devices,
                    source: segFromSecondFormat.source,
                    campaign: segFromSecondFormat.campaign,
                    ctry: segFromSecondFormat.country || "",
                    cust: Array.isArray(segFromSecondFormat.customSegments) ? segFromSecondFormat.customSegments : [],
                };

                alignedSeg.new =
                    segFromSecondFormat.visitorType === "new"
                        ? 1
                        : segFromSecondFormat.visitorType === "returning"
                            ? 0
                            : undefined;

                return alignedSeg;
            }

            let convert_attributes = {
                cid: convert.data.account_id,
                pid: convert.data.project.id,
                vid: session_id,
                goals: JSON.stringify(convert.currentData.goals || {}),
                vars: variation_list,
                exps: exp_list,
                defaultSegments: alignSegmentsToFirstFormat(convert.getDefaultSegments()),
                max_order_value: convert.data.project.settings.max_order_value,
                min_order_value: convert.data.project.settings.min_order_value,
            };

            // Add currency information
            if (enableCurrencyFunctionality && typeof Shopify !== 'undefined' && Shopify.currency) {
                convert_attributes.currency = Shopify.currency.active;
                convert_attributes.conversionRate = getCurrentConversionRate();
                convert_attributes.defaultCurrency = Shopify.currency.default;
            }

            // Store convert_attributes
            if (storeInCookie) {
                setCookie('convert_attributes', JSON.stringify(convert_attributes), 7);
                console.log('convert_attributes stored in cookie:', convert_attributes);
            } else {
                localStorage.setItem('convert_attributes', JSON.stringify(convert_attributes));
                console.log('convert_attributes stored in localStorage:', convert_attributes);
            }
        }
    }
});

// Initialize currency tracking when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeCurrencyTracking();
});

// Handle currency converter initialization
document.addEventListener('currency:change', function(event) {
    console.log('Currency changed event detected');
    updateConvertAttributes();
});
