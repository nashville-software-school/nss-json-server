# Nested Resource Expansion

This feature enhances JSON Server's `_expand` parameter to support multiple levels of resource embedding.

## Implementation Details

The nested expansion middleware works in two phases:
1. **Request Phase**: It modifies the request before json-server processes it, extracting the nested parts of the expansion parameters.
2. **Response Phase**: After json-server has processed the request and expanded the primary resources, our middleware processes the response to expand the nested resources.

## Basic Usage

The standard JSON Server `_expand` parameter allows you to embed a related resource based on a foreign key:

```
GET /people/1?_expand=city
```

Response:
```json
{
  "id": 1,
  "name": "John Smith",
  "cityId": 4,
  "city": {
    "id": 4,
    "name": "Pittsburgh",
    "stateId": 22
  }
}
```

## Nested Expansion

With the nested expansion enhancement, you can now expand multiple levels deep using dot notation:

```
GET /people/1?_expand=city.state
```

Response:
```json
{
  "id": 1,
  "name": "John Smith",
  "cityId": 4,
  "city": {
    "id": 4,
    "name": "Pittsburgh",
    "stateId": 22,
    "state": {
      "id": 22,
      "name": "Pennsylvania"
    }
  }
}
```

## Multiple Levels

You can expand as many levels as needed (up to a maximum depth of 5 to prevent infinite recursion):

```
GET /people/1?_expand=city.state.country
```

Response:
```json
{
  "id": 1,
  "name": "John Smith",
  "cityId": 4,
  "city": {
    "id": 4,
    "name": "Pittsburgh",
    "stateId": 22,
    "state": {
      "id": 22,
      "name": "Pennsylvania",
      "countryId": 1,
      "country": {
        "id": 1,
        "name": "USA"
      }
    }
  }
}
```

## Multiple Expansion Parameters

You can also use multiple `_expand` parameters in the same request:

```
GET /people/1?_expand=city&_expand=state
```

This will expand both the city and state resources.

## Collections

Nested expansion works with collections as well:

```
GET /people?_expand=city.state
```

This will expand the city and state for each person in the collection.

## Error Handling

The middleware gracefully handles cases where resources don't exist:

- If a foreign key points to a non-existent resource, the expansion for that resource will be skipped
- If a resource doesn't have the expected foreign key, the expansion will be skipped

## Implementation Details

- The middleware intercepts responses after JSON Server has processed them
- It parses the `_expand` parameters and creates an expansion map
- It recursively expands nested resources based on the expansion map
- It handles both single resources and collections
- It prevents infinite recursion by limiting expansion depth to 5 levels