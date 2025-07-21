# 🔐 NSS JSON Server

This package will pull in useful mixins created by us and other developers. Documentation and options are simplified for instruction of beginners.

Mixins:

* JWT authentication middleware for **[JSON Server](https://github.com/typicode/json-server)** published by Jeremy Bensimon at **[Json Server with Auth](https://github.com/jeremyben/json-server-auth)**

## Getting started

### Package Install

```bash
# NPM
npm i -g nss-json-server

# Yarn
yarn global add nss-json-server
```

Create a `db.json` file with a `users` collection :

```json
{
  "users": []
}
```

### Alias Setup

Open your bash or zsh initialization file and add the following alias.

```sh
alias js="nss-json-server -X 7h -p 5050 -w"
```

### Running your API

Run with following command:

```bash
js db.json
```

_It exposes and works the same for all [JSON Server flags](https://github.com/typicode/json-server#cli-usage)._

## Authentication flow 🔑

JSON Server Auth adds a simple [JWT based](https://jwt.io/) authentication flow.

### Register 👥

- **`POST /register`**

**`email`** and **`password`** are required in the request body :

```http
POST /register
{
  "email": "admina@gmail.com",
  "password": "bestPassw0rd"
}
```

The response contains the JWT access token, user id and username (if exists):

```http
201 Created
{
  "accessToken": "xxx.xxx.xxx",
  "user": {
    "id": 1,
    "username": "xxxxxxxx"
  }
}
```

Any other property can be added to the request body without being validated:

```http
POST /register
{
  "email": "admina@gmail.com",
  "password": "bestPassw0rd",
  "username": "admina",
  "firstname": "Admina",
  "lastname": "Straytor",
  "age": 32
}
```

### Login 🛂

- **`POST /login`**

**`email`** and **`password`** are required:

```http
POST /login
{
  "email": "admina@gmail.com",
  "password": "bestPassw0rd"
}
```

The response contains the JWT access token:

```http
200 OK
{
  "accessToken": "xxx.xxx.xxx",
  "user": {
    "id": 1,
    "username": "xxxxxxxx"
  }
}
```

## Creating Owned Resources

If any resource has been guarded with an ownership level route:

| Permission | Description |
| -- | -- |
| 600 | User must own the resource to write or read the resource. |
| 640 | User must own the resource to write the resource. User must be logged to read the resource. |
| 644 | User must own the resource to write the resource. Everyone can read the resource. |


Then when you make a request with the POST or PUT method, and there is an authorization header, then the `userId` will be automatically added to the request body.

#### Example

```js
fetch("http://localhost:5050/posts", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer xxxxxx.xx.xxxxx"
    },
    body: JSON.stringify({
        url: "https://media.giphy.com/media/eHWWKfSp0VZ1V87Ixj/giphy.gif",
        image: null,
        timestamp: Date.now()
    })
})
```

Example response:

```json
{
  "url": "https://media.giphy.com/media/eHWWKfSp0VZ1V87Ixj/giphy.gif",
  "image": null,
  "timestamp": 1575211182251,
  "userId": 4,
  "id": 8
}
```

## For Local Development

1. Clone repo
1. `npm i`
1. Create a `routes.json` and `db.json`
1. Add the following to your `routes.json`

### Sample routes.json

```json
{
    "/users*": "/640/users$1",
    "/posts*": "/640/posts$1"
}
```

### Starting the Dev Server


1. `npm run build`
1. `node dist/bin.js -w db.json -p 5050 -X 7h -r routes.json`

### Basic Requests

Using Postman, or your favorite HTTP request client, create the following requests.

* http://localhost:5050/register
    ```js
    // Body (raw JSON)
    {
        "email": "admina@gmail.com",
        "password": "Admin8*",
        "name": "Admina Straytor",
        "username": "admin",
        "location": "Nashville, TN",
        "avatar": ""
    }
    ```
    * **Method** - `POST`
    * **Content-Type** header - `application/json`
* http://localhost:5050/posts
    ```js
    // Body (raw JSON)
    {
        "url": "https://media.giphy.com/media/eHWWKfSp0VZ1V87Ixj/giphy.gif",
        "image": null,
        "timestamp": 1575211182251
    }
    ```
    * **Method** - `POST`
    * **Authorization** header - Use token from registration response
    * **Content-Type** header - `application/json`
    * **Accept** header - `application/json`