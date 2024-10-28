let enableCurrencyFunctionality = false; // Flag to enable Currency Conversion
let storeInCookie = true; // Flag to control storage method

// Function to set a cookie using convert.setCookie
function setCookie(name, value, days) {
    convert.setCookie(name, value, { expires: days });
}

// Ensuring _conv_q is initialized
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

            // Function to process experiences from currentData and historicalData
            function processExperiences(sourceData, allData, isHistorical = false) {
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
            }

            // Process current and historical data
            if (convert.currentData && convert.currentData.experiences) {
                processExperiences(convert.currentData.experiences, convert.data);
            }

            if (convert.historicalData && convert.historicalData.experiences) {
                processExperiences(convert.historicalData.experiences, convert.data, true);
            }

            // Convert segments to the first format
            function alignSegmentsToFirstFormat(segFromSecondFormat) {
                const alignedSeg = {
                    browser: segFromSecondFormat.browser,
                    devices: segFromSecondFormat.devices,
                    source: segFromSecondFormat.source,
                    campaign: segFromSecondFormat.campaign,
                    ctry: segFromSecondFormat.country || "",
                    cust: Array.isArray(segFromSecondFormat.customSegments) ? segFromSecondFormat.customSegments : [],
                };

                // Adjust the 'new' flag based on 'visitorType'
                // Since 'visitorType' of "returning" implies the visitor is not new, we map accordingly
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
                conversionRate: 1, // Default value, modify as necessary
                max_order_value: convert.data.project.settings.max_order_value,
                min_order_value: convert.data.project.settings.min_order_value,
            };

            if (enableCurrencyFunctionality && typeof Shopify !== 'undefined' && Shopify.currency && typeof Currency !== 'undefined') {

                let conversionRate = Shopify.currency.active;

                if (!isNaN(conversionRate) && conversionRate !== 0) {
                    convert_attributes.conversionRate = conversionRate;
                } else {
                    console.error('Invalid conversion rate. Not adding currency information.');
                }
            }

            // Store convert_attributes based on the storeInCookie flag
            if (storeInCookie) {
                setCookie('convert_attributes', JSON.stringify(convert_attributes), 7); // Store for 7 days
                console.log('convert_attributes stored in cookie:', convert_attributes);
            } else {
                localStorage.setItem('convert_attributes', JSON.stringify(convert_attributes));
                console.log('convert_attributes stored in localStorage:', convert_attributes);
            }
        }
    }
});