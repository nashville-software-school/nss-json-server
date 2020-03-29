import * as bodyParser from 'body-parser'
import { ErrorRequestHandler, RequestHandler } from 'express'

/**
 * Use same body-parser options as json-server
 */
export const bodyParsingHandler = [
    bodyParser.json({ limit: '50mb' }),
    bodyParser.urlencoded({ extended: false }),
]

/**
 * Json error handler
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    console.error(err)
    res.status(500).jsonp(err.message)
}

/**
 * Just executes the next middleware,
 * to pass directly the request to the json-server router
 */
export const goNext: RequestHandler = (req, res, next) => {
    next()
}

/**
 * Look for a property in the request body and reject the request if found
 */
export function forbidUpdateOn(...forbiddenBodyParams: string[]): RequestHandler {
    return (req, res, next) => {
        const bodyParams = Object.keys(req.body)
        const hasForbiddenParam = bodyParams.some(forbiddenBodyParams.includes)

        if (hasForbiddenParam) {
            res.status(403).jsonp(`Forbidden update on: ${forbiddenBodyParams.join(', ')}`)
        } else {
            next()
        }
    }
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

/**
 * Reject the request for a given method
 */
export function forbidMethod(method: RequestMethod): RequestHandler {
    return (req, res, next) => {
        if (req.method === method) {
            res.sendStatus(405)
        } else {
            next()
        }
    }
}
