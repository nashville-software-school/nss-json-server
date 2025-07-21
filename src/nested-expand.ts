import { RequestHandler, Request, Response, NextFunction } from 'express'
import * as _ from 'lodash'

/**
 * Interface for the expansion map that tracks which resources need to be expanded
 * and what their nested expansions are.
 */
interface ExpansionMap {
    [resourceType: string]: string[]
}

/**
 * Maximum depth for nested expansions to prevent infinite recursion
 * with circular references.
 */
const MAX_EXPANSION_DEPTH = 5

/**
 * Parse the _expand query parameters and create a map of resource types
 * to their nested expansions.
 *
 * @param query The request query object
 * @returns An expansion map
 */
function parseExpandParams(query: any): ExpansionMap {
    const expansionMap: ExpansionMap = {}

    // Handle both single _expand parameter and multiple _expand parameters
    const expandParams = Array.isArray(query._expand)
        ? query._expand
        : query._expand ? [query._expand] : []

    // Process each expansion parameter
    expandParams.forEach((param: string) => {
        // Split by dot notation for nested expansions (e.g., city.state)
        const parts = param.split('.')

        // The first part is the primary resource to expand
        const primaryResource = parts[0]

        // Initialize the resource in the map if it doesn't exist
        if (!expansionMap[primaryResource]) {
            expansionMap[primaryResource] = []
        }

        // If there are nested resources, add them to the map
        if (parts.length > 1) {
            // Create the nested expansion string (e.g., state.country becomes state)
            const nestedExpansion = parts.slice(1).join('.')

            // Add the nested expansion to the primary resource
            expansionMap[primaryResource].push(nestedExpansion)
        }
    })

    return expansionMap
}

/**
 * Recursively expand nested resources based on the expansion map.
 *
 * @param resource The resource object to expand
 * @param expansionMap The map of resource types to their nested expansions
 * @param db The database instance
 * @param foreignKeySuffix The suffix used for foreign keys (default: 'Id')
 * @param depth The current expansion depth (for preventing infinite recursion)
 * @returns The resource object with nested expansions
 */
function expandNestedResources(
    resource: any,
    expansionMap: ExpansionMap,
    db: any,
    foreignKeySuffix: string = 'Id',
    depth: number = 0
): any {
    // Prevent infinite recursion
    if (depth >= MAX_EXPANSION_DEPTH) {
        return resource
    }

    // Clone the resource to avoid modifying the original
    const expandedResource = _.cloneDeep(resource)

    // Process each expanded property in the resource
    Object.keys(expandedResource).forEach(key => {
        // Check if this property is an expanded resource (not a primitive or array of primitives)
        if (
            expandedResource[key] &&
            typeof expandedResource[key] === 'object' &&
            !Array.isArray(expandedResource[key])
        ) {
            const resourceType = key

            // Check if this resource type has nested expansions
            if (expansionMap[resourceType] && expansionMap[resourceType].length > 0) {
                // Create a new expansion map for the nested resource
                const nestedExpansionMap: ExpansionMap = {}

                // Process each nested expansion
                expansionMap[resourceType].forEach(nestedExpansion => {
                    // Split by dot notation for further nested expansions
                    const parts = nestedExpansion.split('.')
                    const primaryNestedResource = parts[0]

                    // Initialize the nested resource in the map if it doesn't exist
                    if (!nestedExpansionMap[primaryNestedResource]) {
                        nestedExpansionMap[primaryNestedResource] = []
                    }

                    // If there are further nested resources, add them to the map
                    if (parts.length > 1) {
                        const furtherNestedExpansion = parts.slice(1).join('.')
                        nestedExpansionMap[primaryNestedResource].push(furtherNestedExpansion)
                    }
                })

                // For each nested resource type, find the corresponding resource and expand it
                Object.keys(nestedExpansionMap).forEach(nestedResourceType => {
                    // Construct the foreign key name
                    const foreignKey = `${nestedResourceType}${foreignKeySuffix}`

                    // Check if the expanded resource has the foreign key
                    if (expandedResource[key][foreignKey]) {
                        // Get the foreign key value
                        const foreignKeyValue = expandedResource[key][foreignKey]

                        // Find the nested resource in the database
                        try {
                            const nestedResource = db.get(nestedResourceType).getById(foreignKeyValue).value()

                            // If the nested resource exists, expand it and add it to the expanded resource
                            if (nestedResource) {
                                expandedResource[key][nestedResourceType] = expandNestedResources(
                                    nestedResource,
                                    nestedExpansionMap,
                                    db,
                                    foreignKeySuffix,
                                    depth + 1
                                )
                            }
                        } catch (error) {
                            // If the resource doesn't exist in the database, just continue
                            console.error(`Error expanding nested resource: ${error}`)
                        }
                    }
                })
            }
        }
    })

    return expandedResource
}

/**
 * Express middleware that intercepts responses and applies nested expansion.
 * This middleware should be added after json-server's default middleware.
 */
export const nestedExpandMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    // Store the original send method
    const originalSend = res.send

    // Override the send method to intercept the response
    res.send = function (body: any): Response {
        try {
            // Only process JSON responses
            if (res.getHeader('Content-Type')?.toString().includes('application/json')) {
                // Parse the response body if it's a string
                const data = typeof body === 'string' ? JSON.parse(body) : body

                // Check if there are _expand parameters in the query
                if (req.query._expand) {
                    // Get the database instance
                    const { db } = req.app

                    if (!db) {
                        throw new Error('Database instance not found in app')
                    }

                    // Parse the expand parameters
                    const expansionMap = parseExpandParams(req.query)

                    // Get the foreign key suffix from the app settings or use the default
                    const foreignKeySuffix = (req.app.get('json-server-options') as any)?.foreignKeySuffix || 'Id'

                    // Apply nested expansion to the response data
                    if (Array.isArray(data)) {
                        // Handle collections
                        const expandedData = data.map(item =>
                            expandNestedResources(item, expansionMap, db, foreignKeySuffix)
                        )
                        return originalSend.call(this, JSON.stringify(expandedData))
                    } else {
                        // Handle single resources
                        const expandedData = expandNestedResources(data, expansionMap, db, foreignKeySuffix)
                        return originalSend.call(this, JSON.stringify(expandedData))
                    }
                }
            }

            // If no expansion is needed or it's not a JSON response, just send the original body
            return originalSend.call(this, body)
        } catch (error) {
            // If there's an error, log it and send the original body
            console.error('Error in nested expansion middleware:', error)
            return originalSend.call(this, body)
        }
    }

    // Continue to the next middleware
    next()
}

export default nestedExpandMiddleware