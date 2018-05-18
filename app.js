/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Simple app to explore Node.js + Koa + MySQL basics for CRUD admin + API                        */
/*                                                                                                */
/* App comprises three (composed) sub-apps:                                                       */
/*  - www.   (public website pages)                                                               */
/*  - admin. (pages for interactively managing data)                                              */
/*  - api.   (RESTful CRUD API)                                                                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict' /* app is already declared in the upper scope */;
/* eslint no-shadow:off */ const Koa = require('koa'); // Koa framework
const body = require('koa-body'); // body parser
const mysql = require('mysql2/promise'); // fast mysql driver
const debug = require('debug')('app'); // small debugging utility
const cors = require('koa2-cors'); // CORS for Koa 2
const jwt = require('jsonwebtoken'); // JSON Web Token implementation
const bunyan = require('bunyan'); // logging
const koaLogger = require('koa-bunyan'); // logging

require('dotenv').config(); // loads environment variables from .env file (if available - eg dev env)

const app = new Koa();

// MySQL connection pool (set up on app initialisation)
const config = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
};

global.connectionPool = mysql.createPool(config); // put in global to pass to sub-apps

/* set up middleware which will be applied to each request - - - - - - - - - - - - - - - - - - -  */

// return response time in X-Response-Time header
app.use(async function responseTime(ctx, next) {
  const t1 = Date.now();
  await next();
  const t2 = Date.now();
  ctx.set('X-Response-Time', Math.ceil(t2 - t1) + 'ms');
});

// HTTP compression
//app.use(compress({}));

// only search-index www subdomain
app.use(async function robots(ctx, next) {
  await next();
  ctx.response.set('X-Robots-Tag', 'noindex, nofollow');
});

// parse request body into ctx.request.body
app.use(body());

// sometimes useful to be able to track each request...
app.use(async function(ctx, next) {
  debug(ctx.method + ' ' + ctx.url);
  await next();
});


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
  try {
    await next();
  } catch (e) {
    ctx.status = e.status || 500;
    switch (ctx.status) {
      case 204: // No Content
        console.log('status', ctx.status);
        break;
      case 401: // Unauthorized
        ctx.set('WWW-Authenticate', 'Basic');
        break;
      case 403: // Forbidden
      case 404: // Not Found
      case 406: // Not Acceptable
      case 409: // Conflict
        ctx.body = { message: e.message };
        break;
      default:
      case 500: // Internal Server Error (for uncaught or programming errors)
        console.error(ctx.status, e.message);
        ctx.body = { message: e.message };
        if (app.env !== 'production') ctx.body.stack = e.stack;
        ctx.app.emit('error', e, ctx); // github.com/koajs/koa/wiki/Error-Handling
        break;
    }
  }
});

app.use(cors({
  origin: '*',
  exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
  maxAge: 5,
  credentials: true,
  allowMethods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// set up MySQL connection
app.use(async function mysqlConnection(ctx, next) {
  try {
    // keep copy of ctx.state.db in global for access from models
    ctx.state.db = global.db = await global.connectionPool.getConnection();
    ctx.state.db.connection.config.namedPlaceholders = true;
    // traditional mode ensures not null is respected for unsupplied fields, ensures valid JavaScript dates, etc
    await ctx.state.db.query('SET SESSION sql_mode = "TRADITIONAL"');

    await next();

    ctx.state.db.release();
  } catch (e) {
    // note if getConnection() fails we have no this.state.db, but if anything downstream throws,
    // we need to release the connection
    if (ctx.state.db) ctx.state.db.release();
    throw e;
  }
});

// logging
const access = {
  type: 'rotating-file',
  path: './logs/api-access.log',
  level: 'trace',
  period: '1d',
  count: 4
};
const error = {
  type: 'rotating-file',
  path: './logs/api-error.log',
  level: 'error',
  period: '1d',
  count: 4
};
const logger = bunyan.createLogger({ name: 'api', streams: [access, error] });
app.use(koaLogger(logger, {}));

// ------------ routing

// public (unsecured) modules first

app.use(require('./routes/routes-root.js'));
app.use(require('./routes/routes-auth.js'));

// remaining routes require JWT auth (obtained from /auth and supplied in bearer authorization header)

app.use(async function verifyJwt(ctx, next) {
  if (!ctx.header.authorization) ctx.throw(401, 'Authorisation required');
  const [scheme, token] = ctx.header.authorization.split(' ');
  if (scheme != 'Bearer') ctx.throw(401, 'Invalid authorisation');

  try {
    const payload = jwt.verify(token, process.env.JWT_KEY); // throws on invalid token
    // valid token: accept it...

    let sqla = `select status from user where id = ${payload.id}`;
    const [[res]] = await global.db.query(sqla);

    if (res.status === 0){
      throw({status: 401, message: "Account Disabled"});
    }

    ctx.state.user = payload; // for user id  to look up user details
  } catch (e) {
    if (e.message === 'invalid token') ctx.throw(401, 'Invalid JWT'); // Unauthorized
    ctx.throw(e.status || 401, e.message); // Internal Server Error
  }

  await next();

});

app.use(require('./routes/routes-user.js'));
app.use(require('./routes/routes-team.js'));
app.use(require('./routes/routes-geo.js'));

app.use(function *(){
  this.body = 'Invalid URL!!!';
  // or redirect etc
  // this.redirect('/someotherspot');
});

/* create server - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

app.listen(process.env.PORT || 3000);
console.info(
  `${process.version} listening on port ${process.env.PORT || 3000} (${
    app.env
  }/${config.database})`
);

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
