import * as request from 'supertest'
import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as jsonServer from 'json-server'
import nestedExpandMiddleware from '../nested-expand'

describe('Nested Expand Middleware', () => {
    let app: express.Application
    let router: express.Router
    let server: any

    // Sample data for testing
    const db = {
        people: [
            { id: 1, name: 'John Smith', cityId: 1 },
            { id: 2, name: 'Jane Doe', cityId: 2 }
        ],
        cities: [
            { id: 1, name: 'New York', stateId: 1 },
            { id: 2, name: 'Pittsburgh', stateId: 2 }
        ],
        states: [
            { id: 1, name: 'New York', countryId: 1 },
            { id: 2, name: 'Pennsylvania', countryId: 1 }
        ],
        countries: [
            { id: 1, name: 'USA' }
        ]
    }

    beforeEach(() => {
        // Create Express app
        app = express()

        // Create JSON Server router
        router = jsonServer.router(db)

        // Set up the app
        app.use(bodyParser.json())
        app.use(bodyParser.urlencoded({ extended: false }))

        // Add our nested expand middleware
        app.use(nestedExpandMiddleware)

        // Add the router
        app.use(router)

        // Create server
        server = app.listen(3000)
    })

    afterEach(() => {
        // Close server after each test
        server.close()
    })

    test('should expand a single level resource', async () => {
        const response = await request(app)
            .get('/people/1?_expand=city')
            .expect('Content-Type', /json/)
            .expect(200)

        expect(response.body).toHaveProperty('city')
        expect(response.body.city).toHaveProperty('id', 1)
        expect(response.body.city).toHaveProperty('name', 'New York')
    })

    test('should expand nested resources with dot notation', async () => {
        const response = await request(app)
            .get('/people/1?_expand=city.state')
            .expect('Content-Type', /json/)
            .expect(200)

        expect(response.body).toHaveProperty('city')
        expect(response.body.city).toHaveProperty('state')
        expect(response.body.city.state).toHaveProperty('id', 1)
        expect(response.body.city.state).toHaveProperty('name', 'New York')
    })

    test('should expand multiple levels of nested resources', async () => {
        const response = await request(app)
            .get('/people/1?_expand=city.state.country')
            .expect('Content-Type', /json/)
            .expect(200)

        expect(response.body).toHaveProperty('city')
        expect(response.body.city).toHaveProperty('state')
        expect(response.body.city.state).toHaveProperty('country')
        expect(response.body.city.state.country).toHaveProperty('id', 1)
        expect(response.body.city.state.country).toHaveProperty('name', 'USA')
    })

    test('should handle multiple _expand parameters', async () => {
        const response = await request(app)
            .get('/people/1?_expand=city&_expand=state')
            .expect('Content-Type', /json/)
            .expect(200)

        expect(response.body).toHaveProperty('city')
        expect(response.body.city).toHaveProperty('id', 1)
        expect(response.body.city).toHaveProperty('name', 'New York')
    })

    test('should handle collections of resources', async () => {
        const response = await request(app)
            .get('/people?_expand=city.state')
            .expect('Content-Type', /json/)
            .expect(200)

        expect(Array.isArray(response.body)).toBe(true)
        expect(response.body[0]).toHaveProperty('city')
        expect(response.body[0].city).toHaveProperty('state')
        expect(response.body[0].city.state).toHaveProperty('id', 1)
        expect(response.body[0].city.state).toHaveProperty('name', 'New York')

        expect(response.body[1]).toHaveProperty('city')
        expect(response.body[1].city).toHaveProperty('state')
        expect(response.body[1].city.state).toHaveProperty('id', 2)
        expect(response.body[1].city.state).toHaveProperty('name', 'Pennsylvania')
    })

    test('should gracefully handle non-existent resources', async () => {
        // Modify a person to have a non-existent city ID
        const modifiedDb = {
            ...db,
            people: [
                { id: 3, name: 'Invalid Person', cityId: 999 },
                ...db.people
            ]
        }

        // Create a new router with the modified DB
        const modifiedRouter = jsonServer.router(modifiedDb)

        // Create a new app with the modified router
        const modifiedApp = express()
        modifiedApp.use(bodyParser.json())
        modifiedApp.use(bodyParser.urlencoded({ extended: false }))
        modifiedApp.use(nestedExpandMiddleware)
        modifiedApp.use(modifiedRouter)

        const modifiedServer = modifiedApp.listen(3001)

        try {
            const response = await request(modifiedApp)
                .get('/people/3?_expand=city.state')
                .expect('Content-Type', /json/)
                .expect(200)

            // Should still return the person, just without the expanded city
            expect(response.body).toHaveProperty('id', 3)
            expect(response.body).toHaveProperty('name', 'Invalid Person')
            expect(response.body).toHaveProperty('cityId', 999)
            expect(response.body).not.toHaveProperty('city')
        } finally {
            modifiedServer.close()
        }
    })
})