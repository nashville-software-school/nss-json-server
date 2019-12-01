# 🔐 NSS JSON Server

This package will pull in useful mixins created by us and other developers. Documentation and options are simplified for instruction of beginners.

Mixins:

* JWT authentication middleware for **[JSON Server](https://github.com/typicode/json-server)** published by Jeremy Bensimon at **[Json Server with Auth](https://github.com/jeremyben/json-server-auth)**

## Getting started

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

Run with following command:

```bash
nss-json-server -w db.json -p 8088 -X 7h
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
  "email": "olivier@mail.com",
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
  "email": "olivier@mail.com",
  "password": "bestPassw0rd",
  "firstname": "Olivier",
  "lastname": "Monge",
  "age": 32
}
```

### Login 🛂

- **`POST /login`**

**`email`** and **`password`** are required:

```http
POST /login
{
  "email": "olivier@mail.com",
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
