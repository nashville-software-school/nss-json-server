import { RequestHandler, Request, Response, NextFunction } from 'express'
import * as _ from 'lodash'

/**
 * Express middleware that handles nested resource expansion.
 * This middleware should be added before json-server's default middleware.
 */
export const nestedExpandMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    console.log('Nested expand middleware v2 activated for URL:', req.originalUrl);

    // Only process GET requests with _expand parameters
    if (req.method !== 'GET' || !req.originalUrl.includes('_expand=')) {
        return next();
    }

    // Parse the query string to get all _expand parameters
    const urlParts = req.originalUrl.split('?');
    if (urlParts.length < 2) {
        return next();
    }

    const queryString = urlParts[1];
    const params = new URLSearchParams(queryString);
    const expandParams = params.getAll('_expand');

    console.log('Original _expand parameters:', expandParams);

    // Check if any _expand parameter contains a dot (.)
    const hasNestedExpand = expandParams.some(param => param.includes('.'));
    if (!hasNestedExpand) {
        return next();
    }

    console.log('Nested expansion detected');

    // Process nested expands
    const processedExpands: string[] = [];
    const nestedExpands: Record<string, string[]> = {};

    expandParams.forEach(param => {
        if (param.includes('.')) {
            // This is a nested expand
            const parts = param.split('.');
            const primaryResource = parts[0];

            // Add the primary resource to the processed expands
            if (!processedExpands.includes(primaryResource)) {
                processedExpands.push(primaryResource);
            }

            // Store the nested part for later processing
            if (!nestedExpands[primaryResource]) {
                nestedExpands[primaryResource] = [];
            }

            if (parts.length > 1) {
                nestedExpands[primaryResource].push(parts.slice(1).join('.'));
            }
        } else {
            // This is a regular expand, keep it as is
            if (!processedExpands.includes(param)) {
                processedExpands.push(param);
            }
        }
    });

    console.log('Processed expands:', processedExpands);
    console.log('Nested expands:', nestedExpands);

    // Remove all _expand parameters from the query string
    const newParams = new URLSearchParams();
    // Use forEach instead of entries() for better TypeScript compatibility
    params.forEach((value, key) => {
        if (key !== '_expand') {
            newParams.append(key, value);
        }
    });

    // Add the processed _expand parameters back
    processedExpands.forEach(expand => {
        newParams.append('_expand', expand);
    });

    // Update the request URL
    const newQueryString = newParams.toString();
    const newUrl = `${urlParts[0]}?${newQueryString}`;
    console.log('Modified URL:', newUrl);

    // Store the nested expands in the request for later processing
    (req as any).nestedExpands = nestedExpands;

    // Update the request URL
    req.url = newUrl;

    // Store the original send method
    const originalSend = res.send;

    // Override the send method to process the response
    res.send = function (body: any): Response {
        try {
            // Only process JSON responses
            const contentType = res.getHeader('Content-Type');
            const isJsonResponse = contentType && contentType.toString().includes('application/json');

            if (isJsonResponse && (req as any).nestedExpands) {
                console.log('Processing response for nested expands');

                // Parse the response body
                const data = typeof body === 'string' ? JSON.parse(body) : body;

                // Get the database instance
                const db = req.app.db;
                console.log('Database instance:', db ? 'exists' : 'does not exist');
                if (db) {
                    console.log('Database state:', Object.keys(db.getState()));
                    console.log('Database collections:');
                    Object.keys(db.getState()).forEach(collection => {
                        console.log(`- ${collection}: ${db.get(collection).size().value()} items`);
                    });
                }

                // Process the nested expands
                const processedData = processNestedExpands(data, (req as any).nestedExpands, db);

                // Send the processed data
                return originalSend.call(this, JSON.stringify(processedData));
            }

            // If no processing is needed, send the original body
            return originalSend.call(this, body);
        } catch (error) {
            console.error('Error processing nested expands:', error);
            return originalSend.call(this, body);
        }
    };

    next();
};

/**
 * Process nested expands in the response data.
 */
function processNestedExpands(data: any, nestedExpands: Record<string, string[]>, db: any): any {
    if (!data || !nestedExpands || Object.keys(nestedExpands).length === 0) {
        return data;
    }

    console.log('Processing nested expands:', nestedExpands);
    console.log('Available database collections:', Object.keys(db.getState()));

    // Handle both single resources and collections
    if (Array.isArray(data)) {
        return data.map(item => processNestedExpandsForItem(item, nestedExpands, db));
    } else {
        return processNestedExpandsForItem(data, nestedExpands, db);
    }
}

/**
 * Process nested expands for a single resource.
 */
function processNestedExpandsForItem(item: any, nestedExpands: Record<string, string[]>, db: any, depth: number = 0): any {
    if (!item || typeof item !== 'object' || depth > 5) {
        return item;
    }

    console.log('Processing item:', JSON.stringify(item).substring(0, 100) + '...');

    // Clone the item to avoid modifying the original
    const result = _.cloneDeep(item);

    // Process each expanded property
    Object.keys(nestedExpands).forEach(resourceName => {
        console.log(`Looking for expanded resource ${resourceName} in item`);

        // First, check if json-server has already expanded the resource
        if (result[resourceName] && typeof result[resourceName] === 'object') {
            console.log(`Found expanded resource ${resourceName}:`, JSON.stringify(result[resourceName]).substring(0, 100) + '...');

            // Process nested expands for this resource
            const nestedExpandsForResource = nestedExpands[resourceName];

            if (nestedExpandsForResource && nestedExpandsForResource.length > 0) {
                // Create a new nested expands object for the next level
                const nextLevelExpands: Record<string, string[]> = {};

                nestedExpandsForResource.forEach(nestedExpand => {
                    const parts = nestedExpand.split('.');
                    const primaryResource = parts[0];

                    if (!nextLevelExpands[primaryResource]) {
                        nextLevelExpands[primaryResource] = [];
                    }

                    if (parts.length > 1) {
                        // Add the remaining parts as a nested expand
                        nextLevelExpands[primaryResource].push(parts.slice(1).join('.'));
                    } else {
                        // If there are no more parts, add an empty string to indicate this resource should be expanded
                        // This ensures the expansion is processed even if there are no further nested levels
                        nextLevelExpands[primaryResource].push('');
                    }
                });

                console.log('Created next level expands:', JSON.stringify(nextLevelExpands));

                console.log(`Next level expands for ${resourceName}:`, nextLevelExpands);

                // Special case for country expansion
                if (resourceName === 'state' && nextLevelExpands['country'] && result[resourceName]['countryId']) {
                    const countryId = result[resourceName]['countryId'];
                    console.log(`Direct country expansion: Looking for country with id ${countryId}`);

                    // Try different collection names for country
                    let countryCollection;
                    let collectionName;

                    // Try all possible collection names
                    const possibleCollectionNames = ['country', 'countrys', 'countries'];

                    for (const name of possibleCollectionNames) {
                        countryCollection = db.get(name);
                        if (countryCollection && countryCollection.size().value() > 0) {
                            collectionName = name;
                            console.log(`Found country collection: ${collectionName}`);
                            break;
                        }
                    }

                    if (countryCollection && countryCollection.size().value() > 0) {
                        try {
                            const countryResource = countryCollection.getById(countryId).value();
                            if (countryResource) {
                                console.log(`Found country:`, JSON.stringify(countryResource).substring(0, 100) + '...');
                                result[resourceName]['country'] = countryResource;
                                console.log(`Successfully expanded country in state`);
                            } else {
                                console.error(`Country with id ${countryId} not found in collection ${collectionName}`);
                            }
                        } catch (error) {
                            console.error(`Error getting country by id: ${error}`);
                        }
                    } else {
                        console.error(`Could not find any country collection`);
                    }
                }

                // For each resource in the next level, add the _expand parameter
                Object.keys(nextLevelExpands).forEach(nextResource => {
                    const foreignKey = `${nextResource}Id`;

                    if (result[resourceName][foreignKey]) {
                        const foreignKeyValue = result[resourceName][foreignKey];
                        console.log(`Found foreign key ${foreignKey} with value ${foreignKeyValue} in ${resourceName}`);

                        try {
                            // Get the related resource from the database
                            const relatedResource = db.get(nextResource).getById(foreignKeyValue).value();

                            if (relatedResource) {
                                console.log(`Found related resource ${nextResource}:`, JSON.stringify(relatedResource).substring(0, 100) + '...');

                                // Add the related resource to the result
                                result[resourceName][nextResource] = relatedResource;

                                // Process further nested expands
                                // Process further nested expands, even if the array contains only empty strings
                                if (nextLevelExpands[nextResource].length > 0) {
                                    const furtherNestedExpands: Record<string, string[]> = {};
                                    furtherNestedExpands[nextResource] = nextLevelExpands[nextResource];

                                    console.log(`Processing further nested expands for ${nextResource}:`, nextLevelExpands[nextResource]);

                                    // Check if we're at the final level (only empty strings in the array)
                                    const isLastLevel = nextLevelExpands[nextResource].every(item => item === '');

                                    if (isLastLevel) {
                                        console.log(`Reached final expansion level for ${nextResource}`);
                                        // For the final level, we need to explicitly look up the country
                                        if (nextResource === 'country' && result[resourceName]['countryId']) {
                                            const countryId = result[resourceName]['countryId'];
                                            console.log(`Looking for country with id ${countryId}`);

                                            // Try different collection names for country
                                            let countryCollection;
                                            let collectionName;

                                            // Try singular form
                                            countryCollection = db.get('country');
                                            collectionName = 'country';

                                            // Try simple plural form
                                            if (!countryCollection || countryCollection.size().value() === 0) {
                                                countryCollection = db.get('countrys');
                                                collectionName = 'countrys';
                                            }

                                            // Try irregular plural form
                                            if (!countryCollection || countryCollection.size().value() === 0) {
                                                countryCollection = db.get('countries');
                                                collectionName = 'countries';
                                            }

                                            if (countryCollection && countryCollection.size().value() > 0) {
                                                console.log(`Found country collection: ${collectionName}`);
                                                try {
                                                    const countryResource = countryCollection.getById(countryId).value();
                                                    if (countryResource) {
                                                        console.log(`Found country:`, JSON.stringify(countryResource).substring(0, 100) + '...');
                                                        result[resourceName][nextResource] = countryResource;
                                                        console.log(`Successfully expanded ${nextResource} in ${resourceName}`);
                                                    }
                                                } catch (error) {
                                                    console.error(`Error getting country by id: ${error}`);
                                                }
                                            } else {
                                                console.error(`Could not find any country collection`);
                                            }
                                        }
                                    } else {
                                        // Recursively process the next level
                                        const processedItem = processNestedExpandsForItem(
                                            result[resourceName],
                                            { [nextResource]: nextLevelExpands[nextResource] },
                                            db,
                                            depth + 1
                                        );

                                        // Ensure the processed item is assigned back to the result
                                        result[resourceName] = processedItem;
                                    }

                                    // Verify the expansion worked
                                    if (result[resourceName][nextResource]) {
                                        console.log(`Successfully expanded ${nextResource} in ${resourceName}`);
                                    } else {
                                        console.error(`Failed to expand ${nextResource} in ${resourceName}`);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Error expanding ${nextResource} for ${resourceName}:`, error);
                        }
                    }
                });
            }
        }
        // If json-server hasn't expanded the resource yet, we need to do it ourselves
        else {
            console.log(`Resource ${resourceName} not found in item, checking for foreign key ${resourceName}Id`);
            const foreignKey = `${resourceName}Id`;

            if (result[foreignKey]) {
                const foreignKeyValue = result[foreignKey];
                console.log(`Found foreign key ${foreignKey} with value ${foreignKeyValue}`);

                try {
                    // Get the database instance
                    if (!db) {
                        console.error('Database instance not found');
                        return result;
                    }

                    // Get the collection
                    console.log(`Looking for collection ${resourceName} in database`);
                    console.log(`Database has collections:`, Object.keys(db.getState()));

                    // Try various forms of the collection name
                    let collection = db.get(resourceName);
                    let actualResourceName = resourceName;

                    // If not found, try different pluralization patterns
                    if (!collection || collection.size().value() === 0) {
                        // Try standard plural form (add 's')
                        const pluralResourceName = resourceName + 's';
                        console.log(`Collection ${resourceName} not found or empty, trying plural form ${pluralResourceName}`);
                        collection = db.get(pluralResourceName);
                        if (collection && collection.size().value() > 0) {
                            actualResourceName = pluralResourceName;
                        }
                    }

                    // If still not found, try irregular plural form (add 'ies' for words ending in 'y')
                    if ((!collection || collection.size().value() === 0) && resourceName.endsWith('y')) {
                        const irregularPluralResource = resourceName.slice(0, -1) + 'ies';
                        console.log(`Collection still not found, trying irregular plural form ${irregularPluralResource}`);
                        collection = db.get(irregularPluralResource);
                        if (collection && collection.size().value() > 0) {
                            actualResourceName = irregularPluralResource;
                        }
                    }

                    if (!collection || collection.size().value() === 0) {
                        console.error(`Collection ${resourceName} not found in database or is empty`);
                        return result;
                    }

                    console.log(`Found collection ${actualResourceName} with ${collection.size().value()} items`);

                    // Get the related resource
                    console.log(`Looking for resource ${resourceName} with id ${foreignKeyValue}`);

                    let relatedResource;
                    try {
                        relatedResource = collection.getById(foreignKeyValue).value();
                    } catch (error) {
                        console.error(`Error getting resource by id: ${error}`);
                    }

                    if (!relatedResource) {
                        // Try finding the resource by id as a string
                        console.log(`Resource not found with numeric id, trying string id`);
                        try {
                            relatedResource = collection.find({ id: String(foreignKeyValue) }).value();
                        } catch (error) {
                            console.error(`Error finding resource by string id: ${error}`);
                        }
                    }

                    if (!relatedResource) {
                        console.error(`Resource ${resourceName} with id ${foreignKeyValue} not found in database`);
                        return result;
                    }

                    console.log(`Found related resource ${resourceName}:`, JSON.stringify(relatedResource).substring(0, 100) + '...');

                    // Add the related resource to the result
                    result[resourceName] = _.cloneDeep(relatedResource);

                    // Process nested expands for this resource
                    const nestedExpandsForResource = nestedExpands[resourceName];

                    if (nestedExpandsForResource && nestedExpandsForResource.length > 0) {
                        // Create a new nested expands object for the next level
                        const nextLevelExpands: Record<string, string[]> = {};

                        nestedExpandsForResource.forEach(nestedExpand => {
                            const parts = nestedExpand.split('.');
                            const primaryResource = parts[0];

                            if (!nextLevelExpands[primaryResource]) {
                                nextLevelExpands[primaryResource] = [];
                            }

                            if (parts.length > 1) {
                                // Add the remaining parts as a nested expand
                                nextLevelExpands[primaryResource].push(parts.slice(1).join('.'));
                            } else {
                                // If there are no more parts, add an empty string to indicate this resource should be expanded
                                // This ensures the expansion is processed even if there are no further nested levels
                                nextLevelExpands[primaryResource].push('');
                            }
                        });

                        console.log('Created next level expands:', JSON.stringify(nextLevelExpands));

                        console.log(`Next level expands for ${resourceName}:`, nextLevelExpands);

                        // Special case for country expansion
                        if (resourceName === 'state' && nextLevelExpands['country'] && result[resourceName]['countryId']) {
                            const countryId = result[resourceName]['countryId'];
                            console.log(`Direct country expansion: Looking for country with id ${countryId}`);

                            // Try different collection names for country
                            let countryCollection;
                            let collectionName;

                            // Try all possible collection names
                            const possibleCollectionNames = ['country', 'countrys', 'countries'];

                            for (const name of possibleCollectionNames) {
                                countryCollection = db.get(name);
                                if (countryCollection && countryCollection.size().value() > 0) {
                                    collectionName = name;
                                    console.log(`Found country collection: ${collectionName}`);
                                    break;
                                }
                            }

                            if (countryCollection && countryCollection.size().value() > 0) {
                                try {
                                    const countryResource = countryCollection.getById(countryId).value();
                                    if (countryResource) {
                                        console.log(`Found country:`, JSON.stringify(countryResource).substring(0, 100) + '...');
                                        result[resourceName]['country'] = countryResource;
                                        console.log(`Successfully expanded country in state`);
                                    } else {
                                        console.error(`Country with id ${countryId} not found in collection ${collectionName}`);
                                    }
                                } catch (error) {
                                    console.error(`Error getting country by id: ${error}`);
                                }
                            } else {
                                console.error(`Could not find any country collection`);
                            }
                        }

                        // For each resource in the next level, add the _expand parameter
                        Object.keys(nextLevelExpands).forEach(nextResource => {
                            const nextForeignKey = `${nextResource}Id`;

                            if (result[resourceName][nextForeignKey]) {
                                const nextForeignKeyValue = result[resourceName][nextForeignKey];
                                console.log(`Found foreign key ${nextForeignKey} with value ${nextForeignKeyValue} in ${resourceName}`);

                                try {
                                    // Get the related resource from the database
                                    console.log(`Looking for nested resource ${nextResource} with id ${nextForeignKeyValue}`);

                                    // Try various forms of the collection name
                                    let nextCollection = db.get(nextResource);
                                    let actualNextResourceName = nextResource;

                                    // If not found, try different pluralization patterns
                                    if (!nextCollection || nextCollection.size().value() === 0) {
                                        // Try standard plural form (add 's')
                                        const pluralNextResource = nextResource + 's';
                                        console.log(`Collection ${nextResource} not found or empty, trying plural form ${pluralNextResource}`);
                                        nextCollection = db.get(pluralNextResource);
                                        if (nextCollection && nextCollection.size().value() > 0) {
                                            actualNextResourceName = pluralNextResource;
                                        }
                                    }

                                    // If still not found, try irregular plural form (add 'ies' for words ending in 'y')
                                    if ((!nextCollection || nextCollection.size().value() === 0) && nextResource.endsWith('y')) {
                                        const irregularPluralResource = nextResource.slice(0, -1) + 'ies';
                                        console.log(`Collection still not found, trying irregular plural form ${irregularPluralResource}`);
                                        nextCollection = db.get(irregularPluralResource);
                                        if (nextCollection && nextCollection.size().value() > 0) {
                                            actualNextResourceName = irregularPluralResource;
                                        }
                                    }

                                    if (!nextCollection || nextCollection.size().value() === 0) {
                                        console.error(`Collection ${nextResource} not found in database or is empty`);
                                        return;
                                    }

                                    console.log(`Found collection ${actualNextResourceName} with ${nextCollection.size().value()} items`);

                                    let nextRelatedResource;
                                    try {
                                        nextRelatedResource = nextCollection.getById(nextForeignKeyValue).value();
                                    } catch (error) {
                                        console.error(`Error getting resource by id: ${error}`);
                                    }

                                    if (!nextRelatedResource) {
                                        // Try finding the resource by id as a string
                                        console.log(`Resource not found with numeric id, trying string id`);
                                        try {
                                            nextRelatedResource = nextCollection.find({ id: String(nextForeignKeyValue) }).value();
                                        } catch (error) {
                                            console.error(`Error finding resource by string id: ${error}`);
                                        }
                                    }

                                    if (!nextRelatedResource) {
                                        // Try finding the resource by id as a number
                                        console.log(`Resource not found with string id, trying numeric id`);
                                        try {
                                            nextRelatedResource = nextCollection.find({ id: Number(nextForeignKeyValue) }).value();
                                        } catch (error) {
                                            console.error(`Error finding resource by numeric id: ${error}`);
                                        }
                                    }

                                    if (nextRelatedResource) {
                                        console.log(`Found related resource ${nextResource}:`, JSON.stringify(nextRelatedResource).substring(0, 100) + '...');

                                        // Add the related resource to the result
                                        result[resourceName][nextResource] = nextRelatedResource;

                                        // Process further nested expands
                                        if (nextLevelExpands[nextResource].length > 0) {
                                            const furtherNestedExpands: Record<string, string[]> = {};
                                            furtherNestedExpands[nextResource] = nextLevelExpands[nextResource];

                                            console.log(`Processing further nested expands for ${nextResource}:`, nextLevelExpands[nextResource]);

                                            // Check if we're at the final level (only empty strings in the array)
                                            const isLastLevel = nextLevelExpands[nextResource].every(item => item === '');

                                            if (isLastLevel) {
                                                console.log(`Reached final expansion level for ${nextResource}`);
                                                // For the final level, we need to explicitly look up the country
                                                if (nextResource === 'country' && result[resourceName]['countryId']) {
                                                    const countryId = result[resourceName]['countryId'];
                                                    console.log(`Looking for country with id ${countryId}`);

                                                    // Try different collection names for country
                                                    let countryCollection;
                                                    let collectionName;

                                                    // Try singular form
                                                    countryCollection = db.get('country');
                                                    collectionName = 'country';

                                                    // Try simple plural form
                                                    if (!countryCollection || countryCollection.size().value() === 0) {
                                                        countryCollection = db.get('countrys');
                                                        collectionName = 'countrys';
                                                    }

                                                    // Try irregular plural form
                                                    if (!countryCollection || countryCollection.size().value() === 0) {
                                                        countryCollection = db.get('countries');
                                                        collectionName = 'countries';
                                                    }

                                                    if (countryCollection && countryCollection.size().value() > 0) {
                                                        console.log(`Found country collection: ${collectionName}`);
                                                        try {
                                                            const countryResource = countryCollection.getById(countryId).value();
                                                            if (countryResource) {
                                                                console.log(`Found country:`, JSON.stringify(countryResource).substring(0, 100) + '...');
                                                                result[resourceName][nextResource] = countryResource;
                                                                console.log(`Successfully expanded ${nextResource} in ${resourceName}`);
                                                            }
                                                        } catch (error) {
                                                            console.error(`Error getting country by id: ${error}`);
                                                        }
                                                    } else {
                                                        console.error(`Could not find any country collection`);
                                                    }
                                                }
                                            } else {
                                                // Recursively process the next level
                                                const processedItem = processNestedExpandsForItem(
                                                    result[resourceName],
                                                    { [nextResource]: nextLevelExpands[nextResource] },
                                                    db,
                                                    depth + 1
                                                );

                                                // Ensure the processed item is assigned back to the result
                                                result[resourceName] = processedItem;

                                                // Verify the expansion worked
                                                if (result[resourceName][nextResource]) {
                                                    console.log(`Successfully expanded ${nextResource} in ${resourceName}`);
                                                } else {
                                                    console.error(`Failed to expand ${nextResource} in ${resourceName}`);
                                                }
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error expanding ${nextResource} for ${resourceName}:`, error);
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error expanding resource ${resourceName}:`, error);
                }
            }
        }
    });

    return result;
}

export default nestedExpandMiddleware