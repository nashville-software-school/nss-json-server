import { RequestHandler } from 'express'
import guardsRouter, { rewriter } from './guards'
import usersRouter from './users'
import nestedExpandMiddleware from './nested-expand'

interface MiddlewaresWithRewriter extends Array<RequestHandler> {
	rewriter: typeof rewriter
}

// @ts-ignore shut the compiler up about defining in two steps
const middlewares: MiddlewaresWithRewriter = [usersRouter, guardsRouter, nestedExpandMiddleware]
Object.defineProperty(middlewares, 'rewriter', { value: rewriter, enumerable: false })

// export middlewares as is, so we can simply pass the module to json-server `--middlewares` flag
export = middlewares
